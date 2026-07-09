type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type FixedWindowRateLimiterOptions = {
  limit: number;
  windowMs: number;
  maxEntries?: number;
  now?: () => number;
};

export function createFixedWindowRateLimiter(options: FixedWindowRateLimiterOptions) {
  const entries = new Map<string, RateLimitEntry>();
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxEntries = Math.max(100, Math.floor(options.maxEntries ?? 10_000));
  const now = options.now ?? Date.now;

  return {
    check(key: string): RateLimitResult {
      const currentTime = now();
      const existing = entries.get(key);
      const entry = !existing || existing.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + windowMs }
        : existing;

      entry.count += 1;
      entries.set(key, entry);

      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== "string") break;
        entries.delete(oldestKey);
      }

      return {
        allowed: entry.count <= limit,
        limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000)),
        resetAt: entry.resetAt,
      };
    },
  };
}

function configuredLimit() {
  const value = Number(process.env.RUN_CONNECT_RATE_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : 5;
}

const runConnectRateLimiter = createFixedWindowRateLimiter({
  limit: configuredLimit(),
  windowMs: 60_000,
});

export function getConnectClientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRunConnectRateLimit(request: Request, runId: string) {
  return runConnectRateLimiter.check(`${runId}:${getConnectClientAddress(request)}`);
}
