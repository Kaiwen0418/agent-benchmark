export type ExpiredSessionCandidate = {
  id: string;
  attemptId: string | null;
  runId: string | null;
  taskSlug: string;
  sequenceIndex: number;
};

type TimeoutAttempt = (params: {
  attemptId: string;
  runId: string | null;
  expiredSessionId: string;
  expiredTaskSlug: string;
}) => Promise<{ body: { ok: boolean } }>;

export async function timeoutExpiredAttempts(params: {
  sessions: ExpiredSessionCandidate[];
  timeoutAttempt: TimeoutAttempt;
  onError?: (session: ExpiredSessionCandidate, error: unknown) => void;
}) {
  const candidates = [...params.sessions]
    .filter((session): session is ExpiredSessionCandidate & { attemptId: string } => Boolean(session.attemptId))
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex || left.id.localeCompare(right.id));
  const claimedAttemptIds = new Set<string>();
  let timedOutAttempts = 0;

  for (const session of candidates) {
    if (claimedAttemptIds.has(session.attemptId)) {
      continue;
    }
    claimedAttemptIds.add(session.attemptId);

    try {
      const response = await params.timeoutAttempt({
        attemptId: session.attemptId,
        runId: session.runId,
        expiredSessionId: session.id,
        expiredTaskSlug: session.taskSlug,
      });
      if (response.body.ok) {
        timedOutAttempts += 1;
      }
    } catch (error) {
      params.onError?.(session, error);
    }
  }

  return timedOutAttempts;
}
