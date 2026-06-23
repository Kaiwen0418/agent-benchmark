import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const forumLiteTestSupport: HostedAppTestSupport<"forum-lite"> = {
  applyPassingState(session, config) {
    const threadId = configString(config, "targetThreadId");
    const thread = session.state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      throw new Error(`missing thread ${threadId}`);
    }
    thread.posts.push({ id: "post-matrix", author: "agent", body: configString(config, "expectedReplyValue") });
    thread.locked = true;
    session.state.moderationActions.push({
      id: "moderation-matrix",
      threadId,
      action: "lock",
      reason: configString(config, "expectedLockReason"),
    });
  },
  breakPassingState(session) {
    session.state.moderationActions[0]!.reason = "wrong reason";
  },
};
