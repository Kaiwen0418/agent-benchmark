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
