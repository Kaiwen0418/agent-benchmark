import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import type { HostedRouteHandler } from "../routes/index.js";
import type {
  HostedAppId,
  HostedAppStateById,
  HostedSession,
  HostedSessionFor,
} from "./types.js";

export type {
  HostedAppId,
  HostedAppPersistenceState,
  HostedAppSessionState,
  HostedAppStateById,
} from "./types.js";

export function isStateRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readStateArray<T>(
  value: unknown,
  key: string,
  isItem: (item: unknown) => item is T,
) {
  if (!isStateRecord(value) || !Array.isArray(value[key])) {
    return undefined;
  }
  return value[key].filter(isItem);
}

export type HostedAppRouteDeps = {
  publicBaseUrl: string;
  defaultStartPathForApp: (app: string) => string;
  now: () => string;
  makeId: (prefix: string) => string;
  getSession: (url: URL, request: IncomingMessage) => Promise<HostedSession | null>;
  persistSessionSnapshot: (session: HostedSession) => Promise<void>;
  recordEvent: (session: HostedSession, payload: Record<string, unknown>) => Promise<void>;
  forwardRunEvent: (session: HostedSession, type: string, payload: Record<string, unknown>) => Promise<void>;
  completeSession: (session: HostedSession, result: HostedWebScoreResult) => Promise<HostedWebScoreResult | null>;
  evaluateSession: (session: HostedSession) => HostedWebScoreResult;
  resolveSessionResult: (session: HostedSession) => Promise<HostedWebScoreResult>;
  rejectTerminalMutation: (session: HostedSession, response: ServerResponse) => boolean;
  readForm: (request: IncomingMessage) => Promise<URLSearchParams>;
  badRequest: (response: ServerResponse, message: string) => void;
  notFound: (response: ServerResponse) => void;
};

export type HostedAppDefinition<TApp extends HostedAppId = HostedAppId> = {
  id: TApp;
  stateKeys: readonly (keyof HostedAppStateById[TApp])[];
  getDefaultStartPath: () => string;
  getDefaultGoal: (taskSlug: string) => string;
  buildInitialSessionState: () => HostedAppStateById[TApp];
  hydratePersistedState: (value: unknown) => Partial<HostedAppStateById[TApp]>;
  buildFinalState: (session: HostedSessionFor<TApp>) => unknown;
  evaluate: (session: HostedSessionFor<TApp>) => HostedWebScoreResult;
  createRoutes: (deps: HostedAppRouteDeps) => HostedRouteHandler[];
};
