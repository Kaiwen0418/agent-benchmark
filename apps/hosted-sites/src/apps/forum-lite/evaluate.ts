import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { ForumThread, ModerationAction } from "./types.js";

export type ForumEvaluationSession = {
  app: "forum-lite" | string;
  taskSlug: string;
  threads: ForumThread[];
  moderationActions: ModerationAction[];
};

const EXPECTED_RECALL_LINK = "https://support.example.com/recall/battery-2026";
const TARGET_THREAD_ID = "thr-battery";
const EXPECTED_LOCK_REASON = "safety escalation";

export function evaluateForum(session: ForumEvaluationSession): HostedWebScoreResult {
  const targetThread = session.threads.find((candidate) => candidate.id === TARGET_THREAD_ID);
  const retrieve = evaluateRetrieveValue(session, targetThread);
  const backend = evaluateForumBackendState(session, targetThread);
  const ui = targetThread?.locked
    ? passedEvaluator({
        type: "ui_state",
        name: "thread locked banner visible",
        required: false,
        evidence: { threadId: TARGET_THREAD_ID },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "thread locked banner visible",
        required: false,
        errorMessage: "Thread is not locked.",
      });

  return aggregateStrictScore({
    evaluators: [retrieve, backend, ui],
    passSummary: "Agent found the battery thread, replied with the recall link, and locked it with the correct reason.",
    failSummary: "One or more required forum conditions were not met.",
  });
}

function evaluateRetrieveValue(
  _session: ForumEvaluationSession,
  targetThread: ForumThread | undefined,
): HostedWebEvaluatorResult {
  const agentReplies = targetThread?.posts.filter((post) => post.author === "agent") ?? [];
  const hasRecallLink = agentReplies.some((post) => post.body.includes(EXPECTED_RECALL_LINK));

  if (hasRecallLink) {
    return passedEvaluator({
      type: "retrieve_value",
      name: "reply contains official recall link",
      evidence: {
        threadId: TARGET_THREAD_ID,
        expectedLink: EXPECTED_RECALL_LINK,
        agentReplyCount: agentReplies.length,
      },
    });
  }

  return failedEvaluator({
    type: "retrieve_value",
    name: "reply contains official recall link",
    errorMessage: `No agent reply contains the expected recall link: ${EXPECTED_RECALL_LINK}.`,
    evidence: {
      threadId: TARGET_THREAD_ID,
      expectedLink: EXPECTED_RECALL_LINK,
      agentReplyCount: agentReplies.length,
    },
  });
}

function evaluateForumBackendState(
  session: ForumEvaluationSession,
  targetThread: ForumThread | undefined,
): HostedWebEvaluatorResult {
  if (!targetThread) {
    return failedEvaluator({
      type: "backend_state",
      name: "battery thread moderated and replied",
      errorMessage: "Target battery thread not found.",
    });
  }

  const agentReplies = targetThread.posts.filter((post) => post.author === "agent");
  const hasAgentReply = agentReplies.length > 0;
  const isLocked = targetThread.locked === true;
  const lockAction = session.moderationActions.find(
    (action) => action.threadId === TARGET_THREAD_ID && action.action === "lock",
  );
  const lockReasonMatches = lockAction?.reason.trim().toLowerCase() === EXPECTED_LOCK_REASON.toLowerCase();

  const evidence = {
    threadId: TARGET_THREAD_ID,
    hasAgentReply,
    agentReplyCount: agentReplies.length,
    isLocked,
    lockReason: lockAction?.reason ?? null,
    lockReasonMatches,
  };

  const pass = hasAgentReply && isLocked && lockReasonMatches;

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "battery thread moderated and replied",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "battery thread moderated and replied",
        errorMessage:
          "Backend state must include an agent reply, the thread must be locked, and the lock reason must be 'safety escalation'.",
        evidence,
      });
}
