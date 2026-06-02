import type { HostedSession } from "../../runtime/types.js";

export function buildForumFinalState(session: HostedSession) {
  const targetThread = session.threads.find((candidate) => candidate.id === "thr-battery");
  const lockAction = session.moderationActions.find(
    (action) => action.threadId === "thr-battery" && action.action === "lock",
  );

  return {
    app: "forum-lite",
    taskSlug: session.taskSlug,
    targetThread: targetThread
      ? {
          id: targetThread.id,
          title: targetThread.title,
          locked: Boolean(targetThread.locked),
          postCount: targetThread.posts.length,
          agentReplyCount: targetThread.posts.filter((post) => post.author === "agent").length,
        }
      : null,
    lockAction: lockAction
      ? {
          id: lockAction.id,
          reason: lockAction.reason,
        }
      : null,
  };
}
