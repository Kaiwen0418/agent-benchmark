export function selectVisibleHostedSessions<T extends { sessionId: string }>(
  phase: string,
  sessions: T[],
  activeSessionId: string | null,
) {
  if (phase !== "booting" && phase !== "running") {
    return sessions;
  }

  const activeSession = sessions.find((session) => session.sessionId === activeSessionId);
  return activeSession ? [activeSession] : sessions;
}

export type HostedSessionProgressSnapshot = {
  sessionId: string;
  status: string;
  sequenceIndex: number;
  taskSlug?: string;
  expiresAt?: string | null;
  timeLimitMinutes?: number | null;
};

export type HostedProgressEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export type HostedConnectionProgressPayload<TSession extends HostedSessionProgressSnapshot> = {
  hostedWeb: {
    activeSessionId: string | null;
    progress: {
      currentIndex: number | null;
      total: number;
      completed: number;
    };
    sessions: TSession[];
  };
};

const terminalSessionStatuses = new Set(["completed", "failed", "expired"]);

export function isTerminalHostedSessionStatus(status: string) {
  return terminalSessionStatuses.has(status);
}

export function hasTerminalHostedSessionProgress(sessions: HostedSessionProgressSnapshot[]) {
  return sessions.length > 0 && sessions.every((session) => isTerminalHostedSessionStatus(session.status));
}

function parseProgressSession(value: unknown): HostedSessionProgressSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.sessionId !== "string" ||
    typeof item.status !== "string" ||
    typeof item.sequenceIndex !== "number" ||
    !Number.isFinite(item.sequenceIndex)
  ) {
    return null;
  }
  return {
    sessionId: item.sessionId,
    status: item.status,
    sequenceIndex: item.sequenceIndex,
    taskSlug: typeof item.taskSlug === "string" ? item.taskSlug : undefined,
    expiresAt: item.expiresAt === null || typeof item.expiresAt === "string" ? item.expiresAt : undefined,
    timeLimitMinutes:
      item.timeLimitMinutes === null ||
      (typeof item.timeLimitMinutes === "number" && Number.isFinite(item.timeLimitMinutes))
        ? item.timeLimitMinutes
        : undefined,
  };
}

export function deriveHostedSessionProgressFromEvents(events: HostedProgressEvent[]) {
  const latest = [...events].reverse().find((event) => event.type === "hosted.session.progress");
  const sessions = Array.isArray(latest?.payload.sessions) ? latest.payload.sessions : [];
  return sessions
    .map(parseProgressSession)
    .filter((session): session is HostedSessionProgressSnapshot => Boolean(session))
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}

export function applyHostedSessionProgress<
  TSession extends HostedSessionProgressSnapshot,
  TPayload extends HostedConnectionProgressPayload<TSession>,
>(
  payload: TPayload,
  snapshots: HostedSessionProgressSnapshot[],
) {
  const snapshotsBySessionId = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot]));
  const sessions = payload.hostedWeb.sessions.map((session) => ({
    ...session,
    status: snapshotsBySessionId.get(session.sessionId)?.status ?? session.status,
  }));
  const activeSession = sessions.find((session) => session.status === "active") ?? null;

  return {
    ...payload,
    hostedWeb: {
      ...payload.hostedWeb,
      activeSessionId: activeSession?.sessionId ?? null,
      progress: {
        currentIndex: activeSession?.sequenceIndex ?? null,
        total: sessions.length,
        completed: sessions.filter((session) => session.status === "completed").length,
      },
      sessions,
    },
  } satisfies TPayload;
}
