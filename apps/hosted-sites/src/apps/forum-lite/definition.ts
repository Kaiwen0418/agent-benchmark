import { createForumRoutes } from "../../routes/forum.js";
import type { HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateForum } from "./evaluate.js";
import { buildForumFinalState } from "./final-state.js";
import { forumSeedModerations, forumSeedThreads, getForumDefaultGoal, getForumStartPath } from "./seed.js";

export const forumLiteDefinition: HostedAppDefinition = {
  id: "forum-lite",
  getDefaultStartPath: getForumStartPath,
  getDefaultGoal: () => getForumDefaultGoal(),
  buildInitialSessionState: () => ({
    threads: forumSeedThreads.map((thread) => ({
      ...thread,
      posts: thread.posts.map((post) => ({ ...post })),
    })),
    moderationActions: forumSeedModerations.map((action) => ({ ...action })),
  }),
  buildFinalState: buildForumFinalState,
  evaluate: evaluateForum,
  createRoutes: (deps) => [createForumRoutes(deps).handle],
};
