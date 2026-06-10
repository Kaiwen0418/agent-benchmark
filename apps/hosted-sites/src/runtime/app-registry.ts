import { forumLiteDefinition } from "../apps/forum-lite/definition.js";
import { repoLiteDefinition } from "../apps/repo-lite/definition.js";
import { shoppingLiteDefinition } from "../apps/shopping-lite/definition.js";
import { wikiLiteDefinition } from "../apps/wiki-lite/definition.js";
import type { HostedAppDefinition, HostedAppRouteDeps } from "./app-definition.js";
import type {
  HostedAppId,
  HostedAppPersistenceState,
  HostedAppStateById,
  HostedSession,
} from "./types.js";

const appDefinitions = {
  "shopping-lite": shoppingLiteDefinition,
  "wiki-lite": wikiLiteDefinition,
  "forum-lite": forumLiteDefinition,
  "repo-lite": repoLiteDefinition,
} satisfies { [TApp in HostedAppId]: HostedAppDefinition<TApp> };

export function resolveHostedAppId(app: string): HostedAppId {
  return app in appDefinitions ? (app as HostedAppId) : "shopping-lite";
}

export function getHostedAppDefinition<TApp extends HostedAppId>(
  app: TApp,
): HostedAppDefinition<TApp>;
export function getHostedAppDefinition(app: string): HostedAppDefinition;
export function getHostedAppDefinition(app: string): HostedAppDefinition {
  return appDefinitions[resolveHostedAppId(app)] as HostedAppDefinition;
}

export function extractHostedAppState(session: HostedSession): HostedAppPersistenceState {
  switch (session.app) {
    case "shopping-lite":
      return { products: session.state.products, cart: session.state.cart, orders: session.state.orders };
    case "wiki-lite":
      return {
        wikiArticles: session.state.wikiArticles,
        wikiAnswerSubmissions: session.state.wikiAnswerSubmissions,
      };
    case "forum-lite":
      return { threads: session.state.threads, moderationActions: session.state.moderationActions };
    case "repo-lite":
      return {
        files: session.state.files,
        issues: session.state.issues,
        mergeRequests: session.state.mergeRequests,
      };
  }
}

function mergeHydratedState<TApp extends HostedAppId>(
  initialState: HostedAppStateById[TApp],
  hydratedState: Partial<HostedAppStateById[TApp]>,
) {
  const merged = { ...initialState };
  for (const [key, value] of Object.entries(hydratedState)) {
    if (Array.isArray(value)) {
      Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

export function hydrateHostedAppState<TApp extends HostedAppId>(
  app: TApp,
  value: unknown,
): HostedAppStateById[TApp];
export function hydrateHostedAppState(app: string, value: unknown): HostedAppStateById[HostedAppId];
export function hydrateHostedAppState(app: string, value: unknown): HostedAppStateById[HostedAppId] {
  const appId = resolveHostedAppId(app);
  switch (appId) {
    case "shopping-lite":
      return mergeHydratedState(
        shoppingLiteDefinition.buildInitialSessionState(),
        shoppingLiteDefinition.hydratePersistedState(value),
      );
    case "wiki-lite":
      return mergeHydratedState(
        wikiLiteDefinition.buildInitialSessionState(),
        wikiLiteDefinition.hydratePersistedState(value),
      );
    case "forum-lite":
      return mergeHydratedState(
        forumLiteDefinition.buildInitialSessionState(),
        forumLiteDefinition.hydratePersistedState(value),
      );
    case "repo-lite":
      return mergeHydratedState(
        repoLiteDefinition.buildInitialSessionState(),
        repoLiteDefinition.hydratePersistedState(value),
      );
  }
}

export function listHostedAppDefinitions() {
  return Object.values(appDefinitions);
}

export function defaultStartPathForApp(app: string) {
  return getHostedAppDefinition(app).getDefaultStartPath();
}

export function defaultGoalForSession(app: string, taskSlug: string) {
  return getHostedAppDefinition(app).getDefaultGoal(taskSlug);
}

export function buildInitialSessionState<TApp extends HostedAppId>(app: TApp): HostedAppStateById[TApp];
export function buildInitialSessionState(app: string): HostedAppStateById[HostedAppId];
export function buildInitialSessionState(app: string): HostedAppStateById[HostedAppId] {
  return getHostedAppDefinition(app).buildInitialSessionState();
}

export function buildFinalState(session: HostedSession) {
  switch (session.app) {
    case "shopping-lite":
      return shoppingLiteDefinition.buildFinalState(session);
    case "wiki-lite":
      return wikiLiteDefinition.buildFinalState(session);
    case "forum-lite":
      return forumLiteDefinition.buildFinalState(session);
    case "repo-lite":
      return repoLiteDefinition.buildFinalState(session);
  }
}

export function evaluateSession(session: HostedSession) {
  switch (session.app) {
    case "shopping-lite":
      return shoppingLiteDefinition.evaluate(session);
    case "wiki-lite":
      return wikiLiteDefinition.evaluate(session);
    case "forum-lite":
      return forumLiteDefinition.evaluate(session);
    case "repo-lite":
      return repoLiteDefinition.evaluate(session);
  }
}

export function createAppRouteHandlers(deps: HostedAppRouteDeps) {
  return listHostedAppDefinitions().flatMap((definition) => definition.createRoutes(deps));
}
