import assert from "node:assert/strict";
import test from "node:test";
import { timeoutExpiredAttempts, type ExpiredSessionCandidate } from "../../src/expiry-sweep.js";

function expiredSession(overrides: Partial<ExpiredSessionCandidate> = {}): ExpiredSessionCandidate {
  return {
    id: "session-1",
    attemptId: "attempt-1",
    runId: "run-1",
    taskSlug: "shopping-lite",
    sequenceIndex: 0,
    ...overrides,
  };
}

test("expiry sweep terminates each attempt once using its earliest expired session", async () => {
  const calls: Array<{ attemptId: string; expiredSessionId: string }> = [];
  const timedOut = await timeoutExpiredAttempts({
    sessions: [
      expiredSession({ id: "session-2", sequenceIndex: 1 }),
      expiredSession(),
      expiredSession({ id: "session-3", attemptId: "attempt-2", runId: "run-2" }),
      expiredSession({ id: "session-unowned", attemptId: null }),
    ],
    timeoutAttempt: async (params) => {
      calls.push({ attemptId: params.attemptId, expiredSessionId: params.expiredSessionId });
      return { body: { ok: true } };
    },
  });

  assert.equal(timedOut, 2);
  assert.deepEqual(calls, [
    { attemptId: "attempt-1", expiredSessionId: "session-1" },
    { attemptId: "attempt-2", expiredSessionId: "session-3" },
  ]);
});

test("expiry sweep tolerates concurrent terminal transitions and continues after errors", async () => {
  const errors: string[] = [];
  const timedOut = await timeoutExpiredAttempts({
    sessions: [
      expiredSession(),
      expiredSession({ id: "session-2", attemptId: "attempt-2" }),
      expiredSession({ id: "session-3", attemptId: "attempt-3" }),
    ],
    timeoutAttempt: async ({ attemptId }) => {
      if (attemptId === "attempt-1") return { body: { ok: false } };
      if (attemptId === "attempt-2") throw new Error("database unavailable");
      return { body: { ok: true } };
    },
    onError: (session, error) => {
      errors.push(`${session.attemptId}:${error instanceof Error ? error.message : String(error)}`);
    },
  });

  assert.equal(timedOut, 1);
  assert.deepEqual(errors, ["attempt-2:database unavailable"]);
});
