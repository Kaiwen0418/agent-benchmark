import type { HostedSessionDeadline } from "./hosted-web";

export const HOSTED_SESSION_POLL_INTERVAL_MS = 15_000;
export const HOSTED_SESSION_MAX_BACKOFF_MS = 60_000;
export const HOSTED_SESSION_REQUEST_DEDUPE_MS = 1_000;

type RecentRequest = {
  expiresAt: number;
  promise: Promise<HostedSessionDeadline[]>;
};

const recentRequests = new Map<string, RecentRequest>();

export function hostedSessionPollDelay(failures: number) {
  return Math.min(
    HOSTED_SESSION_MAX_BACKOFF_MS,
    HOSTED_SESSION_POLL_INTERVAL_MS * 2 ** Math.max(0, failures),
  );
}

export function isTerminalRunStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "timeout";
}

export function fetchHostedSessionSnapshot(
  runId: string,
  fetchFn: typeof fetch = fetch,
) {
  const now = Date.now();
  const recent = recentRequests.get(runId);
  if (recent && recent.expiresAt > now) {
    return recent.promise;
  }
  if (recent) {
    recentRequests.delete(runId);
  }

  const promise = fetchFn(`/api/runs/${runId}/hosted-sessions`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Hosted session refresh returned HTTP ${response.status}.`);
      }
      const result = (await response.json()) as { sessions: HostedSessionDeadline[] };
      return result.sessions;
    });

  recentRequests.set(runId, {
    expiresAt: now + HOSTED_SESSION_REQUEST_DEDUPE_MS,
    promise,
  });
  return promise;
}
