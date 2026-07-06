import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { ForumThread, ModerationAction } from "./types.js";
import {
  configBooleanOrFalse,
  configString,
  configStringArray,
  configStringOrNull,
  readTaskConfig,
} from "../../runtime/question-config.js";

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
  const requiresMove = configBooleanOrFalse(config, "requiresMove");
  const expectedCategory = requiresMove ? configString(config, "expectedCategory") : null;
  const requiresEditTitle = configBooleanOrFalse(config, "requiresEditTitle");
  const expectedTitle = requiresEditTitle ? configString(config, "expectedTitle") : null;
  const requiresMarkDuplicate = configBooleanOrFalse(config, "requiresMarkDuplicate");
  const canonicalThreadId = requiresMarkDuplicate
    ? configStringOrNull(config, "canonicalThreadId") ?? targetThreadId
    : null;
  const duplicateThreadIds = requiresMarkDuplicate ? configStringArray(config, "duplicateThreadIds") : [];
  const requiredActionOrder = configStringArray(config, "requiredActionOrder");
  const targetThread = session.state.threads.find((candidate) => candidate.id === targetThreadId);
  const retrieve = evaluateRetrieveValue(targetThread, targetThreadId, expectedReplyValue);
  const backend = evaluateForumBackendState(session, targetThread, targetThreadId, {
    expectedLockReason,
    requiresPin,
    requiresReport,
    expectedReportReason,
    requiresMove,
    expectedCategory,
    requiresEditTitle,
    expectedTitle,
    requiresMarkDuplicate,
    canonicalThreadId,
    duplicateThreadIds,
    requiredActionOrder,
  });
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
    passSummary: buildPassSummary({
      requiresPin,
      requiresReport,
      requiresMove,
      requiresEditTitle,
      requiresMarkDuplicate,
    }),
    failSummary: "One or more required forum conditions were not met.",
  });
}

function buildPassSummary(flags: {
  requiresPin: boolean;
  requiresReport: boolean;
  requiresMove: boolean;
  requiresEditTitle: boolean;
  requiresMarkDuplicate: boolean;
}): string {
  const extras: string[] = [];
  if (flags.requiresMove) extras.push("recategorized it");
  if (flags.requiresEditTitle) extras.push("renamed it");
  if (flags.requiresMarkDuplicate) extras.push("consolidated the duplicate threads");
  if (flags.requiresReport) extras.push("filed the required report");
  if (flags.requiresPin) extras.push("pinned it");
  const base =
    "Agent found the generated target thread, replied with the required value, and locked it with the correct reason";
  return extras.length > 0 ? `${base}, and ${extras.join(", ")}.` : `${base}.`;
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
  options: {
    expectedLockReason: string;
    requiresPin: boolean;
    requiresReport: boolean;
    expectedReportReason: string | null;
    requiresMove: boolean;
    expectedCategory: string | null;
    requiresEditTitle: boolean;
    expectedTitle: string | null;
    requiresMarkDuplicate: boolean;
    canonicalThreadId: string | null;
    duplicateThreadIds: string[];
    requiredActionOrder: string[];
  },
): HostedWebEvaluatorResult {
  const {
    expectedLockReason,
    requiresPin,
    requiresReport,
    expectedReportReason,
    requiresMove,
    expectedCategory,
    requiresEditTitle,
    expectedTitle,
    requiresMarkDuplicate,
    canonicalThreadId,
    duplicateThreadIds,
    requiredActionOrder,
  } = options;

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

  const moveAction = requiresMove
    ? session.state.moderationActions.find(
        (action) => action.threadId === targetThreadId && action.action === "move",
      )
    : null;
  const moveMatches =
    !requiresMove ||
    (moveAction != null &&
      (moveAction.targetCategory ?? "").trim().toLowerCase() === (expectedCategory ?? "").toLowerCase() &&
      targetThread.category.trim().toLowerCase() === (expectedCategory ?? "").toLowerCase());

  const editTitleAction = requiresEditTitle
    ? session.state.moderationActions.find(
        (action) => action.threadId === targetThreadId && action.action === "edit_title",
      )
    : null;
  const editTitleMatches =
    !requiresEditTitle ||
    (editTitleAction != null &&
      (editTitleAction.newTitle ?? "").trim() === (expectedTitle ?? "").trim() &&
      targetThread.title.trim() === (expectedTitle ?? "").trim());

  const duplicatesConsolidated =
    !requiresMarkDuplicate ||
    (duplicateThreadIds.length > 0 &&
      duplicateThreadIds.every((duplicateId) =>
        session.state.moderationActions.some(
          (action) =>
            action.action === "mark_duplicate" &&
            action.threadId === duplicateId &&
            action.duplicateOfThreadId === canonicalThreadId,
        ),
      ));
  const relevantThreadIds = new Set([targetThreadId, ...duplicateThreadIds]);
  const actualActionOrder = session.state.moderationActions
    .filter((action) => relevantThreadIds.has(action.threadId))
    .map((action) => action.action)
    .filter((action) => requiredActionOrder.includes(action))
    .filter((action, index, actions) => index === 0 || action !== actions[index - 1]);
  let actionCursor = 0;
  for (const action of actualActionOrder) {
    if (action === requiredActionOrder[actionCursor]) {
      actionCursor += 1;
    }
  }
  const actionOrderMatches =
    requiredActionOrder.length === 0 || actionCursor === requiredActionOrder.length;

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
    requiresMove,
    movedToCategory: moveAction?.targetCategory ?? null,
    currentCategory: targetThread.category,
    moveMatches,
    requiresEditTitle,
    newTitle: editTitleAction?.newTitle ?? null,
    currentTitle: targetThread.title,
    editTitleMatches,
    requiresMarkDuplicate,
    canonicalThreadId,
    duplicateThreadIds,
    duplicatesConsolidated,
    requiredActionOrder,
    actualActionOrder,
    actionOrderMatches,
  };

  const pass =
    hasAgentReply &&
    isLocked &&
    lockReasonMatches &&
    hasPin &&
    hasReport &&
    reportReasonMatches &&
    moveMatches &&
    editTitleMatches &&
    duplicatesConsolidated &&
    actionOrderMatches;

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
          "Backend state must include an agent reply, the thread must be locked with the correct reason, and any required report, pin, move, title, or duplicate actions must be present.",
        evidence,
      });
}
