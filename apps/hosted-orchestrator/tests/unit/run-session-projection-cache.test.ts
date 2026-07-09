import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidateRunSessionProjectionCache,
  readRunSessionProjectionCache,
  runSessionProjectionCacheKey,
  writeRunSessionProjectionCache,
  type ProjectionCacheRedis,
} from "../../src/run-session-projection-cache.js";

function createRedis() {
  const values = new Map<string, string>();
  const expirations = new Map<string, number>();
  const redis: ProjectionCacheRedis = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options) {
      values.set(key, value);
      expirations.set(key, options.EX);
    },
    async del(key) {
      values.delete(key);
      expirations.delete(key);
    },
  };
  return { redis, values, expirations };
}

const sessions = [{
  sessionId: "session-1",
  taskSlug: "cart",
  status: "active",
  sequenceIndex: 0,
  expiresAt: "2026-07-09T12:00:00.000Z",
  timeLimitMinutes: 10,
}];

test("round-trips a run session projection with the configured TTL", async () => {
  const { redis, expirations } = createRedis();

  await writeRunSessionProjectionCache(redis, "run-1", sessions, 10);

  assert.deepEqual(await readRunSessionProjectionCache(redis, "run-1"), sessions);
  assert.equal(expirations.get(runSessionProjectionCacheKey("run-1")), 10);
});

test("removes malformed cached projections", async () => {
  const { redis, values } = createRedis();
  const key = runSessionProjectionCacheKey("run-2");
  values.set(key, JSON.stringify([{ sessionId: "incomplete" }]));

  assert.equal(await readRunSessionProjectionCache(redis, "run-2"), null);
  assert.equal(values.has(key), false);
});

test("invalidates a run session projection", async () => {
  const { redis } = createRedis();
  await writeRunSessionProjectionCache(redis, "run-3", sessions, 10);

  await invalidateRunSessionProjectionCache(redis, "run-3");

  assert.equal(await readRunSessionProjectionCache(redis, "run-3"), null);
});
