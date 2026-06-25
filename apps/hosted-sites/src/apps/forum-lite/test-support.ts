import { configBooleanOrFalse, configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const forumLiteTestSupport: HostedAppTestSupport<"forum-lite"> = {
  exampleTaskConfig: {
    targetThreadId: "thr-battery",
    expectedReplyValue: "https://support.example.com/recall/battery-2026",
    expectedLockReason: "safety escalation",
  },
  applyPassingState(session, config) {
    const threadId = configString(config, "targetThreadId");
    const thread = session.state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      throw new Error(`missing thread ${threadId}`);
    }

    const requiresReport = configBooleanOrFalse(config, "requiresReport");
    if (requiresReport) {
      session.state.moderationActions.push({
        id: "mod-report-matrix",
        threadId,
        action: "report",
        reason: configString(config, "expectedReportReason"),
      });
    }

    thread.posts.push({ id: "post-matrix", author: "agent", body: configString(config, "expectedReplyValue") });
    thread.locked = true;
    session.state.moderationActions.push({
      id: "mod-lock-matrix",
      threadId,
      action: "lock",
      reason: configString(config, "expectedLockReason"),
    });

    const requiresPin = configBooleanOrFalse(config, "requiresPin");
    if (requiresPin) {
      thread.pinned = true;
      session.state.moderationActions.push({
        id: "mod-pin-matrix",
        threadId,
        action: "pin",
        reason: configString(config, "expectedLockReason"),
      });
    }
  },
  breakPassingState(session) {
    const lockAction = session.state.moderationActions.find((a) => a.action === "lock");
    if (lockAction) {
      lockAction.reason = "wrong reason";
    }
  },
};
