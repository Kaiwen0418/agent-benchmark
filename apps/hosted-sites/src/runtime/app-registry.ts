import { buildForumFinalState } from "../apps/forum-lite/final-state.js";
import { forumSeedThreads, forumSeedModerations, getForumDefaultGoal, getForumStartPath } from "../apps/forum-lite/seed.js";
import { buildShoppingFinalState } from "../apps/shopping-lite/final-state.js";
import { shoppingSeedProducts, getShoppingDefaultGoal, getShoppingStartPath } from "../apps/shopping-lite/seed.js";
import { buildWikiFinalState } from "../apps/wiki-lite/final-state.js";
import { wikiSeedArticles, getWikiDefaultGoal, getWikiStartPath } from "../apps/wiki-lite/seed.js";
import type { HostedSession } from "./types.js";

type HostedAppSessionState = Pick<
  HostedSession,
  "products" | "cart" | "orders" | "wikiArticles" | "wikiAnswerSubmissions" | "threads" | "moderationActions"
>;

export type HostedAppDefinition = {
  id: string;
  getDefaultStartPath: () => string;
  getDefaultGoal: (taskSlug: string) => string;
  buildInitialSessionState: () => HostedAppSessionState;
  buildFinalState: (session: HostedSession) => unknown;
};

const shoppingLiteApp: HostedAppDefinition = {
  id: "shopping-lite",
  getDefaultStartPath: getShoppingStartPath,
  getDefaultGoal: () => getShoppingDefaultGoal(),
  buildInitialSessionState: () => ({
    products: shoppingSeedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
    wikiArticles: wikiSeedArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions: [],
    threads: forumSeedThreads.map((thread) => ({ ...thread })),
    moderationActions: [...forumSeedModerations],
  }),
  buildFinalState: buildShoppingFinalState,
};

const wikiLiteApp: HostedAppDefinition = {
  id: "wiki-lite",
  getDefaultStartPath: getWikiStartPath,
  getDefaultGoal: () => getWikiDefaultGoal(),
  buildInitialSessionState: () => ({
    products: shoppingSeedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
    wikiArticles: wikiSeedArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions: [],
    threads: forumSeedThreads.map((thread) => ({ ...thread })),
    moderationActions: [...forumSeedModerations],
  }),
  buildFinalState: buildWikiFinalState,
};

const forumLiteApp: HostedAppDefinition = {
  id: "forum-lite",
  getDefaultStartPath: getForumStartPath,
  getDefaultGoal: () => getForumDefaultGoal(),
  buildInitialSessionState: () => ({
    products: shoppingSeedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
    wikiArticles: wikiSeedArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions: [],
    threads: forumSeedThreads.map((thread) => ({ ...thread })),
    moderationActions: [...forumSeedModerations],
  }),
  buildFinalState: buildForumFinalState,
};

const hostedApps = new Map<string, HostedAppDefinition>([
  [shoppingLiteApp.id, shoppingLiteApp],
  [wikiLiteApp.id, wikiLiteApp],
  [forumLiteApp.id, forumLiteApp],
]);

function getFallbackApp() {
  return hostedApps.get("shopping-lite")!;
}

export function getHostedAppDefinition(app: string) {
  return hostedApps.get(app) ?? getFallbackApp();
}

export function listHostedAppDefinitions() {
  return Array.from(hostedApps.values());
}

export function defaultStartPathForApp(app: string) {
  return getHostedAppDefinition(app).getDefaultStartPath();
}

export function defaultGoalForSession(app: string, taskSlug: string) {
  return getHostedAppDefinition(app).getDefaultGoal(taskSlug);
}

export function buildInitialSessionState(app: string): HostedAppSessionState {
  return getHostedAppDefinition(app).buildInitialSessionState();
}

export function buildFinalState(session: HostedSession) {
  return getHostedAppDefinition(session.app).buildFinalState(session);
}
