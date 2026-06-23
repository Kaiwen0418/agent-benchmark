import type { HostedAppDefinition, HostedAppRouteDeps } from "./app-definition.js";
import { hostedAppDefinitions } from "./generated-app-definitions.js";
import type {
  HostedAppId,
  HostedAppPersistenceState,
  HostedAppStateById,
  HostedSession,
} from "./types.js";

const appDefinitions = hostedAppDefinitions;
const fallbackAppId = ("shopping-lite" in appDefinitions ? "shopping-lite" : Object.keys(appDefinitions)[0]) as HostedAppId;

export function resolveHostedAppId(app: string): HostedAppId {
  return app in appDefinitions ? (app as HostedAppId) : fallbackAppId;
}

export function getHostedAppDefinition<TApp extends HostedAppId>(
  app: TApp,
): HostedAppDefinition<TApp>;
export function getHostedAppDefinition(app: string): HostedAppDefinition;
export function getHostedAppDefinition(app: string): HostedAppDefinition {
  return appDefinitions[resolveHostedAppId(app)] as HostedAppDefinition;
}

export function extractHostedAppState(session: HostedSession): HostedAppPersistenceState {
  const definition = getHostedAppDefinition(session.app);
  return Object.fromEntries(
    definition.stateKeys.map((key) => [key, session.state[key as keyof typeof session.state]]),
  ) as HostedAppPersistenceState;
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
  const definition = getHostedAppDefinition(appId);
  return mergeHydratedState(
    definition.buildInitialSessionState(),
    definition.hydratePersistedState(value),
  );
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
  return (getHostedAppDefinition(session.app).buildFinalState as (value: HostedSession) => unknown)(session);
}

export function evaluateSession(session: HostedSession) {
  return (getHostedAppDefinition(session.app).evaluate as (value: HostedSession) => ReturnType<HostedAppDefinition["evaluate"]>)(
    session,
  );
}

export function createAppRouteHandlers(deps: HostedAppRouteDeps) {
  return listHostedAppDefinitions().flatMap((definition) => definition.createRoutes(deps));
}
