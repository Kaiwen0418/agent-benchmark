import type { HostedAttemptSessionStatus } from "@agentbench/shared";
import type { HostedAppId, HostedAppStateById } from "./generated-app-types.js";

export type { HostedAppId, HostedAppStateById } from "./generated-app-types.js";

export type HostedSessionStatus = HostedAttemptSessionStatus;

export function isTerminalHostedSessionStatus(status: HostedSessionStatus) {
  return status === "completed" || status === "failed" || status === "expired";
}

export type HostedAppSessionState = HostedAppStateById[HostedAppId];
export type HostedAppPersistenceState = Partial<HostedAppSessionState>;

type HostedSessionBase = {
  id: string;
  token: string;
  accessMode?: "write" | "viewer";
  runId: string | null;
  caseId: string | null;
  attemptId: string | null;
  callbackSecret: string | null;
  suiteSlug: string;
  suiteVersion: string;
  taskSlug: string;
  taskVersion: string;
  sequenceIndex: number;
  weight: number;
  required: boolean;
  title: string | null;
  goal: string;
  startPath: string | null;
  seedVersion: string;
  metadata: Record<string, unknown>;
  status: HostedSessionStatus;
  expiresAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  firstSeenIp: string | null;
  lastSeenIp: string | null;
  firstSeenUserAgent: string | null;
  lastSeenUserAgent: string | null;
  createdAt: string;
  events: Array<Record<string, unknown>>;
  persisted: boolean;
};

export type HostedSessionFor<TApp extends HostedAppId> = TApp extends HostedAppId
  ? HostedSessionBase & {
      app: TApp;
      state: HostedAppStateById[TApp];
    }
  : never;

export type HostedSession = {
  [TApp in HostedAppId]: HostedSessionFor<TApp>;
}[HostedAppId];

export function isHostedSessionForApp<TApp extends HostedAppId>(
  session: HostedSession,
  app: TApp,
): session is Extract<HostedSession, { app: TApp }> {
  return session.app === app;
}

export type HostedAttemptOverviewSession = {
  id: string;
  token: string;
  app: string;
  taskSlug: string;
  title: string | null;
  goal: string;
  startPath: string | null;
  sequenceIndex: number;
  status: HostedSessionStatus;
};
