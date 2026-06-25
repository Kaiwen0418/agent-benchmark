import assert from "node:assert/strict";
import test from "node:test";
import { createIdempotentInitializer } from "../../src/idempotent-initializer.js";

type Input = { runId: string; caseId: string };

test("reuses the database attempt before consulting Redis", async () => {
  let lockCalls = 0;
  let createCalls = 0;
  const initialize = createIdempotentInitializer<Input, string>({
    key: ({ runId, caseId }) => `${runId}:${caseId}`,
    findExisting: async () => "attempt-existing",
    waitForExisting: async () => "unexpected",
    acquireLock: async () => {
      lockCalls += 1;
      return null;
    },
    create: async () => {
      createCalls += 1;
      return "attempt-created";
    },
  });

  assert.equal(await initialize({ runId: "run-1", caseId: "case-1" }), "attempt-existing");
  assert.equal(lockCalls, 0);
  assert.equal(createCalls, 0);
});

test("rechecks the database after acquiring the distributed lease", async () => {
  let reads = 0;
  let createCalls = 0;
  let released = false;
  const initialize = createIdempotentInitializer<Input, string>({
    key: ({ runId, caseId }) => `${runId}:${caseId}`,
    findExisting: async () => (++reads === 1 ? null : "attempt-winner"),
    waitForExisting: async () => "unexpected",
    acquireLock: async () => ({ release: async () => { released = true; } }),
    create: async () => {
      createCalls += 1;
      return "attempt-created";
    },
  });

  assert.equal(await initialize({ runId: "run-1", caseId: "case-1" }), "attempt-winner");
  assert.equal(createCalls, 0);
  assert.equal(released, true);
});

test("recovers the database winner when another replica owns the lease", async () => {
  let reads = 0;
  const initialize = createIdempotentInitializer<Input, string>({
    key: ({ runId, caseId }) => `${runId}:${caseId}`,
    findExisting: async () => (++reads === 1 ? null : "attempt-other-replica"),
    waitForExisting: async () => "attempt-other-replica",
    acquireLock: async () => "contended",
    create: async () => "unexpected",
  });

  assert.equal(await initialize({ runId: "run-1", caseId: "case-1" }), "attempt-other-replica");
});

test("falls back to database-enforced creation when Redis is unavailable", async () => {
  let createCalls = 0;
  const initialize = createIdempotentInitializer<Input, string>({
    key: ({ runId, caseId }) => `${runId}:${caseId}`,
    findExisting: async () => null,
    waitForExisting: async () => "unexpected",
    acquireLock: async () => null,
    create: async () => {
      createCalls += 1;
      return "attempt-created";
    },
  });

  assert.equal(await initialize({ runId: "run-1", caseId: "case-1" }), "attempt-created");
  assert.equal(createCalls, 1);
});
