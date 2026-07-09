export type RunConnectFailure = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAt: number | null;
  hostedSitesUrl?: string;
};

type ErrorPayload = {
  error?: unknown;
  message?: unknown;
  retryable?: unknown;
  hostedSitesUrl?: unknown;
};

export function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return now + Math.ceil(seconds * 1_000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(now, date);
}

export function buildRunConnectFailure(
  status: number,
  headers: Headers,
  payload: ErrorPayload | null,
  now = Date.now(),
): RunConnectFailure {
  const permanent = status === 404 || status === 410;
  const retryAt = status === 429 ? parseRetryAfter(headers.get("retry-after"), now) : null;

  return {
    status,
    code: typeof payload?.error === "string" ? payload.error : "run_connect_failed",
    message:
      typeof payload?.message === "string"
        ? payload.message
        : permanent
          ? "This benchmark connection is no longer available."
          : "Failed to load run connection info.",
    retryable: !permanent && payload?.retryable !== false,
    retryAt,
    ...(typeof payload?.hostedSitesUrl === "string" ? { hostedSitesUrl: payload.hostedSitesUrl } : {}),
  };
}

export function connectRetryDelaySeconds(failure: RunConnectFailure, now = Date.now()) {
  if (!failure.retryable) return null;
  if (!failure.retryAt) return 0;
  return Math.max(0, Math.ceil((failure.retryAt - now) / 1_000));
}
