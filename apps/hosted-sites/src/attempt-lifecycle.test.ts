import test from "node:test";
import assert from "node:assert/strict";
import { buildHostedAttemptReadModel } from "@agentbench/shared";
import { createAttemptLifecycle, type AttemptLifecycleAdvanceSession, type AttemptLifecycleSession } from "./attempt-lifecycle";
import type { HostedWebScoreResult } from "@agentbench/scoring";

function createLifecycle(overrides?: {
  loadAttemptMetadata?: (attemptId: string | null) => Promise<Record<string, unknown>>;
  loadAttemptSessions?: (attemptId: string) => Promise<AttemptLifecycleAdvanceSession[]>;
  loadLatestSessionResult?: (sessionId: string) => Promise<HostedWebScoreResult | null>;
  persistScoreResult?: (session: AttemptLifecycleSession, result: HostedWebScoreResult) => Promise<void>;
}) {
  return createAttemptLifecycle({
    now: () => "2026-06-01T00:00:00.000Z",
    getSupabaseAdmin: () => null,
    loadAttemptMetadata: overrides?.loadAttemptMetadata ?? (async () => ({})),
    loadAttemptSessions: overrides?.loadAttemptSessions ?? (async () => []),
    loadAttemptReadModel: async (attemptId) =>
      buildHostedAttemptReadModel({
        attemptId,
        metadata: (await (overrides?.loadAttemptMetadata ?? (async () => ({})))(attemptId)) ?? {},
        sessions: (await (overrides?.loadAttemptSessions ?? (async () => []))(attemptId)).map((session) => ({
          ...session,
          taskSlug: `${session.app}-task`,
          title: null,
          goal: "",
        })),
      }),
    loadLatestSessionResult: overrides?.loadLatestSessionResult ?? (async () => null),
    persistScoreResult: overrides?.persistScoreResult ?? (async () => undefined),
    forwardTimeoutCompletion: async () => undefined,
    evictInMemorySessions: () => undefined,
  });
}

function makeSession(overrides?: Partial<AttemptLifecycleSession>): AttemptLifecycleSession {
  return {
    id: "session-1",
    token: "tok_1",
    runId: "run-1",
    attemptId: "attempt-1",
    app: "shopping-lite",
    taskSlug: "shopping-constrained-checkout",
    suiteSlug: "hosted-web-suite-v1",
    sequenceIndex: 0,
    weight: 1,
    status: "active",
    startPath: "/shopping",
    persisted: true,
    ...overrides,
  };
}

function makeScoreResult(overrides?: Partial<HostedWebScoreResult>): HostedWebScoreResult {
  return {
    status: "passed",
    score: 1,
    summary: "ok",
    evaluators: [],
    ...overrides,
  };
}

test("resolve-advance returns active session from attempt metadata", async () => {
  const lifecycle = createLifecycle({
    loadAttemptMetadata: async () => ({
      activeSessionId: "session-2",
    }),
    loadAttemptSessions: async () => [
      {
        id: "session-1",
        status: "completed",
        sequenceIndex: 0,
        token: "tok_1",
        startPath: "/shopping",
        app: "shopping-lite",
      },
      {
        id: "session-2",
        status: "active",
        sequenceIndex: 1,
        token: "tok_2",
        startPath: "/wiki",
        app: "wiki-lite",
      },
    ],
  });

  const resolved = await lifecycle.executeResolveAdvanceCommand({
    type: "resolve-advance",
    attemptId: "attempt-1",
    currentSessionId: "session-1",
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.complete, false);
  assert.equal(resolved.nextSession?.id, "session-2");
});

test("resolve-advance returns complete when no created or active sessions remain", async () => {
  const lifecycle = createLifecycle({
    loadAttemptMetadata: async () => ({
      activeSessionId: null,
    }),
    loadAttemptSessions: async () => [
      {
        id: "session-1",
        status: "completed",
        sequenceIndex: 0,
        token: "tok_1",
        startPath: "/shopping",
        app: "shopping-lite",
      },
      {
        id: "session-2",
        status: "expired",
        sequenceIndex: 1,
        token: "tok_2",
        startPath: "/wiki",
        app: "wiki-lite",
      },
    ],
  });

  const resolved = await lifecycle.executeResolveAdvanceCommand({
    type: "resolve-advance",
    attemptId: "attempt-1",
    currentSessionId: "session-1",
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.complete, true);
  assert.equal(resolved.nextSession, null);
});

test("complete-session returns existing result when session already completed", async () => {
  const existingResult = makeScoreResult({
    summary: "already done",
  });
  let persisted = false;
  const lifecycle = createLifecycle({
    loadLatestSessionResult: async () => existingResult,
    persistScoreResult: async () => {
      persisted = true;
    },
  });

  const result = await lifecycle.executeCompleteSessionCommand({
    type: "complete-session",
    session: makeSession({ status: "completed" }),
    result: makeScoreResult(),
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.result.summary, "already done");
  assert.equal(persisted, false);
});

test("complete-session rejects non-active session completion", async () => {
  const lifecycle = createLifecycle({
    loadAttemptMetadata: async () => ({
      activeSessionId: "session-2",
    }),
  });

  await assert.rejects(
    () =>
      lifecycle.executeCompleteSessionCommand({
        type: "complete-session",
        session: makeSession({ id: "session-1", attemptId: "attempt-1", status: "active" }),
        result: makeScoreResult(),
      }),
    /not the active session/,
  );
});
