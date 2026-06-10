export type { Database, Json } from "./database.types.js";

export type HostedAttemptSessionStatus = "created" | "active" | "completed" | "failed" | "expired";

export type HostedWebSessionPersistenceStatus =
  | HostedAttemptSessionStatus
  | "scoring";

export type HostedWebSessionMetadata<TAppState extends Record<string, unknown> = Record<string, unknown>> =
  Record<string, unknown> & {
    schemaVersion?: 1;
    suiteSlug?: string;
    suiteVersion?: string;
    title?: string | null;
    goal?: string;
    startPath?: string | null;
    appState?: TAppState;
  };

export type RedisHostedSessionEnvelopeV1<TSession> = {
  schemaVersion: 1;
  session: TSession;
};

export type RedisHostedSessionEnvelopeV2<TSession> = {
  schemaVersion: 2;
  session: TSession;
};

export type HostedAttemptReadSession = {
  id: string;
  sequenceIndex: number;
  status: HostedAttemptSessionStatus;
};

export type HostedAttemptReadModel<TSession extends HostedAttemptReadSession = HostedAttemptReadSession> = {
  attemptId: string;
  activeSessionId: string | null;
  activeSequenceIndex: number | null;
  completedSessionIds: string[];
  progress: {
    total: number;
    completed: number;
  };
  sessions: TSession[];
};

export function buildHostedAttemptReadModel<TSession extends HostedAttemptReadSession>(params: {
  attemptId: string;
  metadata: Record<string, unknown>;
  sessions: TSession[];
}) {
  const completedSessionIds = Array.isArray(params.metadata.completedSessionIds)
    ? params.metadata.completedSessionIds.filter((value): value is string => typeof value === "string")
    : params.sessions
        .filter((session) => session.status === "completed")
        .map((session) => session.id);
  const activeSessionId =
    typeof params.metadata.activeSessionId === "string" ? params.metadata.activeSessionId : null;
  const activeSequenceIndex =
    typeof params.metadata.activeSequenceIndex === "number" ? params.metadata.activeSequenceIndex : null;
  const fallbackActive =
    params.sessions.find((session) => session.id === activeSessionId) ??
    (activeSequenceIndex !== null
      ? params.sessions.find((session) => session.sequenceIndex === activeSequenceIndex)
      : null) ??
    params.sessions.find((session) => session.status === "active") ??
    params.sessions.find((session) => session.status === "created") ??
    null;

  return {
    attemptId: params.attemptId,
    activeSessionId: fallbackActive?.id ?? null,
    activeSequenceIndex: fallbackActive?.sequenceIndex ?? null,
    completedSessionIds,
    progress: {
      total: params.sessions.length,
      completed: completedSessionIds.length,
    },
    sessions: params.sessions,
  } satisfies HostedAttemptReadModel<TSession>;
}
