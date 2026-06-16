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
