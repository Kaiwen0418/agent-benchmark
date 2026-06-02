import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import type { HostedRouteHandler } from "../routes/index.js";
import type { HostedSession } from "./types.js";

export type HostedAppSessionState = Pick<
  HostedSession,
  "products" | "cart" | "orders" | "wikiArticles" | "wikiAnswerSubmissions" | "threads" | "moderationActions"
>;

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
  readForm: (request: IncomingMessage) => Promise<URLSearchParams>;
  badRequest: (response: ServerResponse, message: string) => void;
  notFound: (response: ServerResponse) => void;
};

export type HostedAppDefinition = {
  id: string;
  getDefaultStartPath: () => string;
  getDefaultGoal: (taskSlug: string) => string;
  buildInitialSessionState: () => Partial<HostedAppSessionState>;
  buildFinalState: (session: HostedSession) => unknown;
  evaluate: (session: HostedSession) => HostedWebScoreResult;
  createRoutes: (deps: HostedAppRouteDeps) => HostedRouteHandler[];
};
