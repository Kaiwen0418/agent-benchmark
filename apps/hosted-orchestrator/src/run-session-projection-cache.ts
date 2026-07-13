export type RunSessionProjection = {
  sessionId: string;
  taskSlug: string;
  status: string;
  sequenceIndex: number;
  expiresAt: string | null;
  timeLimitMinutes: number | null;
};

export type ProjectionCacheRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

const keyPrefix = "agentbench:orchestrator:run-session-projection:v1:";

export function runSessionProjectionCacheKey(runId: string) {
  return `${keyPrefix}${runId}`;
}

function isProjection(value: unknown): value is RunSessionProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.sessionId === "string" &&
    typeof item.taskSlug === "string" &&
    typeof item.status === "string" &&
    typeof item.sequenceIndex === "number" &&
    (item.expiresAt === null || typeof item.expiresAt === "string") &&
    (item.timeLimitMinutes === null || typeof item.timeLimitMinutes === "number")
  );
}

export async function readRunSessionProjectionCache(
  redis: ProjectionCacheRedis,
  runId: string,
) {
  const key = runSessionProjectionCacheKey(runId);
  const cached = await redis.get(key);
  if (!cached) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(cached);
    if (Array.isArray(parsed) && parsed.every(isProjection)) {
      return parsed;
    }
  } catch {
    // Delete malformed cache entries and let the durable read repopulate them.
  }

  await redis.del(key);
  return null;
}

export async function writeRunSessionProjectionCache(
  redis: ProjectionCacheRedis,
  runId: string,
  sessions: RunSessionProjection[],
  ttlSeconds: number,
) {
  await redis.set(
    runSessionProjectionCacheKey(runId),
    JSON.stringify(sessions),
    { EX: ttlSeconds },
  );
}

export async function invalidateRunSessionProjectionCache(
  redis: ProjectionCacheRedis,
  runId: string,
) {
  await redis.del(runSessionProjectionCacheKey(runId));
}
