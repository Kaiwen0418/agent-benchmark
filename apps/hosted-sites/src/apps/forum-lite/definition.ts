import { createForumRoutes } from "../../routes/forum.js";
import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateForum } from "./evaluate.js";
import { buildForumFinalState } from "./final-state.js";
import { forumSeedModerations, forumSeedThreads, getForumDefaultGoal, getForumStartPath } from "./seed.js";
import type { ForumPost, ForumThread, ModerationAction } from "./types.js";

function isForumPost(value: unknown): value is ForumPost {
  return isStateRecord(value) && typeof value.id === "string" && typeof value.author === "string" && typeof value.body === "string";
}

function isForumThread(value: unknown): value is ForumThread {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.category === "string" &&
    Array.isArray(value.posts) &&
    value.posts.every(isForumPost) &&
    (value.locked === undefined || typeof value.locked === "boolean")
  );
}

function isModerationAction(value: unknown): value is ModerationAction {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.threadId === "string" &&
    (value.action === "lock" || value.action === "pin" || value.action === "remove_post") &&
    typeof value.reason === "string"
  );
}

export const forumLiteDefinition: HostedAppDefinition<"forum-lite"> = {
  id: "forum-lite",
  stateKeys: ["threads", "moderationActions"],
  getDefaultStartPath: getForumStartPath,
  getDefaultGoal: () => getForumDefaultGoal(),
  buildInitialSessionState: () => ({
    threads: forumSeedThreads.map((thread) => ({
      ...thread,
      posts: thread.posts.map((post) => ({ ...post })),
    })),
    moderationActions: forumSeedModerations.map((action) => ({ ...action })),
  }),
  hydratePersistedState: (value) => ({
    threads: readStateArray(value, "threads", isForumThread),
    moderationActions: readStateArray(value, "moderationActions", isModerationAction),
  }),
  buildFinalState: buildForumFinalState,
  evaluate: evaluateForum,
  createRoutes: (deps) => [createForumRoutes(deps).handle],
};
