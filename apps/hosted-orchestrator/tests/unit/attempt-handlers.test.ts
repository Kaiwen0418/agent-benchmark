import assert from "node:assert/strict";
import test from "node:test";
import type { HostedAttemptReadModel } from "@agentbench/shared";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import { createAttemptHandlers } from "../../src/attempt-handlers.js";
import type { AttemptLifecycleSession } from "../../src/attempt-lifecycle.js";

const score: HostedWebScoreResult = {
  status: "failed",
  score: 0,
  summary: "first result",
  evaluators: [],
};

const session: AttemptLifecycleSession = {
  id: "session-1",
  token: "tok_1",
  runId: "run-1",
  attemptId: "attempt-1",
  app: "wiki-lite",
  taskSlug: "wiki-task",
  suiteSlug: "suite-v1",
  sequenceIndex: 0,
  weight: 1,
  status: "active",
  startPath: "/wiki",
  persisted: true,
};

function makeHandlers(duplicate: boolean, forwardedEvents: string[]) {
  return createAttemptHandlers({
    initializeAttempt: async () => { throw new Error("not used"); },
    completeSessionCommand: async () => ({
      command: "complete-session" as const,
      ok: true as const,
      attemptId: session.attemptId,
      duplicate,
      result: score,
      attemptResult: { complete: false, aggregate: null },
    }),
    resolveAdvanceCommand: async () => { throw new Error("not used"); },
    timeoutAttemptCommand: async () => { throw new Error("not used"); },
    loadAttemptReadModel: async () => ({}) as HostedAttemptReadModel,
    forwardRunEvent: async (_session, type) => { forwardedEvents.push(type); },
    forwardCompletion: async () => undefined,
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp: () => "/wiki",
  });
}

test("first completion forwards one hosted score event", async () => {
  const forwardedEvents: string[] = [];
  const response = await makeHandlers(false, forwardedEvents).handleCompleteSession({ session, result: score });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, score);
  assert.deepEqual(forwardedEvents, ["hosted.score"]);
});

test("duplicate completion returns the first result without forwarding another score event", async () => {
  const forwardedEvents: string[] = [];
  const response = await makeHandlers(true, forwardedEvents).handleCompleteSession({ session, result: score });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, score);
  assert.deepEqual(forwardedEvents, []);
});
