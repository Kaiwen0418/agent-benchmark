import { forumLiteDefinition } from "../apps/forum-lite/definition.js";
import { repoLiteDefinition } from "../apps/repo-lite/definition.js";
import { shoppingLiteDefinition } from "../apps/shopping-lite/definition.js";
import { wikiLiteDefinition } from "../apps/wiki-lite/definition.js";
import type { HostedAppDefinition, HostedAppRouteDeps, HostedAppSessionState } from "./app-definition.js";
import type { HostedSession } from "./types.js";

const emptyInitialSessionState: HostedAppSessionState = {
  products: [],
  cart: [],
  orders: [],
  wikiArticles: [],
  wikiAnswerSubmissions: [],
  threads: [],
  moderationActions: [],
  files: [],
  issues: [],
  mergeRequests: [],
};

const appDefinitions: HostedAppDefinition[] = [
  shoppingLiteDefinition,
  wikiLiteDefinition,
  forumLiteDefinition,
  repoLiteDefinition,
];

const hostedApps = new Map<string, HostedAppDefinition>(
  appDefinitions.map((definition) => [definition.id, definition]),
);

function getFallbackApp() {
  return hostedApps.get("shopping-lite")!;
}

export function getHostedAppDefinition(app: string) {
  return hostedApps.get(app) ?? getFallbackApp();
}

export function listHostedAppDefinitions() {
  return [...appDefinitions];
}

export function defaultStartPathForApp(app: string) {
  return getHostedAppDefinition(app).getDefaultStartPath();
}

export function defaultGoalForSession(app: string, taskSlug: string) {
  return getHostedAppDefinition(app).getDefaultGoal(taskSlug);
}

export function buildInitialSessionState(app: string): HostedAppSessionState {
  return {
    ...emptyInitialSessionState,
    ...getHostedAppDefinition(app).buildInitialSessionState(),
  };
}

export function buildFinalState(session: HostedSession) {
  return getHostedAppDefinition(session.app).buildFinalState(session);
}

export function evaluateSession(session: HostedSession) {
  return getHostedAppDefinition(session.app).evaluate(session);
}

export function createAppRouteHandlers(deps: HostedAppRouteDeps) {
  return appDefinitions.flatMap((definition) => definition.createRoutes(deps));
}
