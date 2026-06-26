import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { ForumThread, ModerationAction } from "./types.js";
import { configBooleanOrFalse, configString, readTaskConfig } from "../../runtime/question-config.js";

export type ForumEvaluationSession = {
  app: "forum-lite" | string;
  taskSlug: string;
  metadata: Record<string, unknown>;
  state: {
    threads: ForumThread[];
    moderationActions: ModerationAction[];
  };
};

export function evaluateForum(session: ForumEvaluationSession): HostedWebScoreResult {
  const config = readTaskConfig(session.metadata);
  const targetThreadId = configString(config, "targetThreadId");
  const expectedReplyValue = configString(config, "expectedReplyValue");
  const expectedLockReason = configString(config, "expectedLockReason");
  const requiresPin = configBooleanOrFalse(config, "requiresPin");
  const requiresReport = configBooleanOrFalse(config, "requiresReport");
  const expectedReportReason = requiresReport ? configString(config, "expectedReportReason") : null;
  const targetThread = session.state.threads.find((candidate) => candidate.id === targetThreadId);
  const retrieve = evaluateRetrieveValue(targetThread, targetThreadId, expectedReplyValue);
  const backend = evaluateForumBackendState(
    session,
    targetThread,
    targetThreadId,
    expectedLockReason,
    requiresPin,
    requiresReport,
    expectedReportReason,
  );
  const ui = targetThread?.locked
    ? passedEvaluator({
        type: "ui_state",
        name: "thread locked banner visible",
        required: false,
        evidence: { threadId: targetThreadId },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "thread locked banner visible",
        required: false,
        errorMessage: "Thread is not locked.",
      });

  return aggregateStrictScore({
    evaluators: [retrieve, backend, ui],
    passSummary: requiresPin
      ? "Agent found the generated target thread, replied with the required value, locked it with the correct reason, and pinned it."
      : requiresReport
        ? "Agent found the generated target thread, reported it, replied with the required value, and locked it with the correct reason."
        : "Agent found the generated target thread, replied with the required value, and locked it with the correct reason.",
    failSummary: "One or more required forum conditions were not met.",
  });
}

function evaluateRetrieveValue(
  targetThread: ForumThread | undefined,
  targetThreadId: string,
  expectedReplyValue: string,
): HostedWebEvaluatorResult {
  const agentReplies = targetThread?.posts.filter((post) => post.author === "agent") ?? [];
  const hasExpectedValue = agentReplies.some((post) => post.body.includes(expectedReplyValue));

  if (hasExpectedValue) {
    return passedEvaluator({
      type: "retrieve_value",
      name: "reply contains generated required value",
      evidence: {
        threadId: targetThreadId,
        expectedValue: expectedReplyValue,
        agentReplyCount: agentReplies.length,
      },
    });
  }

  return failedEvaluator({
    type: "retrieve_value",
    name: "reply contains generated required value",
    errorMessage: `No agent reply contains the expected value: ${expectedReplyValue}.`,
    evidence: {
      threadId: targetThreadId,
      expectedValue: expectedReplyValue,
      agentReplyCount: agentReplies.length,
    },
  });
}

function evaluateForumBackendState(
  session: ForumEvaluationSession,
  targetThread: ForumThread | undefined,
  targetThreadId: string,
  expectedLockReason: string,
  requiresPin: boolean,
  requiresReport: boolean,
  expectedReportReason: string | null,
): HostedWebEvaluatorResult {
  if (!targetThread) {
    return failedEvaluator({
      type: "backend_state",
      name: "generated target thread moderated and replied",
      errorMessage: "Target thread not found.",
    });
  }

  const agentReplies = targetThread.posts.filter((post) => post.author === "agent");
  const hasAgentReply = agentReplies.length > 0;
  const isLocked = targetThread.locked === true;
  const lockAction = session.state.moderationActions.find(
    (action) => action.threadId === targetThreadId && action.action === "lock",
  );
  const lockReasonMatches = lockAction?.reason.trim().toLowerCase() === expectedLockReason.toLowerCase();

  const pinAction = requiresPin
    ? session.state.moderationActions.find(
        (action) => action.threadId === targetThreadId && action.action === "pin",
      )
    : null;
  const hasPin = !requiresPin || pinAction != null;

  const reportAction = requiresReport
    ? session.state.moderationActions.find(
        (action) => action.threadId === targetThreadId && action.action === "report",
      )
    : null;
  const hasReport = !requiresReport || reportAction != null;
  const reportReasonMatches =
    !requiresReport ||
    (reportAction != null &&
      reportAction.reason.trim().toLowerCase() === (expectedReportReason ?? "").toLowerCase());

  const evidence = {
    threadId: targetThreadId,
    hasAgentReply,
    agentReplyCount: agentReplies.length,
    isLocked,
    lockReason: lockAction?.reason ?? null,
    lockReasonMatches,
    requiresPin,
    hasPin,
    requiresReport,
    hasReport,
    reportReason: reportAction?.reason ?? null,
    reportReasonMatches,
  };

  const pass = hasAgentReply && isLocked && lockReasonMatches && hasPin && hasReport && reportReasonMatches;

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "generated target thread moderated and replied",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "generated target thread moderated and replied",
        errorMessage:
          "Backend state must include an agent reply, the thread must be locked with the correct reason, and any required report or pin actions must be present.",
        evidence,
      });
}
