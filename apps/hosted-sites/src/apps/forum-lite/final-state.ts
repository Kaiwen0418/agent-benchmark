import { configString, readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";

export function buildForumFinalState(session: HostedSessionFor<"forum-lite">) {
  const config = readTaskConfig(session.metadata);
  const targetThreadId = configString(config, "targetThreadId");
  const targetThread = session.state.threads.find((candidate) => candidate.id === targetThreadId);
  const lockAction = session.state.moderationActions.find(
    (action) => action.threadId === targetThreadId && action.action === "lock",
  );
  const pinAction = session.state.moderationActions.find(
    (action) => action.threadId === targetThreadId && action.action === "pin",
  );
  const reportAction = session.state.moderationActions.find(
    (action) => action.threadId === targetThreadId && action.action === "report",
  );
  const moveAction = session.state.moderationActions.find(
    (action) => action.threadId === targetThreadId && action.action === "move",
  );
  const editTitleAction = session.state.moderationActions.find(
    (action) => action.threadId === targetThreadId && action.action === "edit_title",
  );
  const duplicateActions = session.state.moderationActions.filter(
    (action) => action.action === "mark_duplicate" && action.duplicateOfThreadId === targetThreadId,
  );

  return {
    app: "forum-lite",
    taskSlug: session.taskSlug,
    targetThread: targetThread
      ? {
          id: targetThread.id,
          title: targetThread.title,
          category: targetThread.category,
          locked: Boolean(targetThread.locked),
          pinned: Boolean(targetThread.pinned),
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
    pinAction: pinAction
      ? {
          id: pinAction.id,
          reason: pinAction.reason,
        }
      : null,
    reportAction: reportAction
      ? {
          id: reportAction.id,
          reason: reportAction.reason,
        }
      : null,
    moveAction: moveAction
      ? {
          id: moveAction.id,
          targetCategory: moveAction.targetCategory ?? null,
        }
      : null,
    editTitleAction: editTitleAction
      ? {
          id: editTitleAction.id,
          newTitle: editTitleAction.newTitle ?? null,
        }
      : null,
    duplicateActions: duplicateActions.map((action) => ({
      id: action.id,
      duplicateThreadId: action.threadId,
    })),
  };
}
