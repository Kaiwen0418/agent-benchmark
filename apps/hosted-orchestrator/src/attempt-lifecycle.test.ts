import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHostedAttemptReadModel, type Database } from "@agentbench/shared";
import {
  createAttemptLifecycle,
  type AttemptLifecycleAdvanceSession,
  type AttemptLifecycleSession,
  type PersistScoreResultOutcome,
} from "./attempt-lifecycle.js";
import type { HostedWebScoreResult } from "@agentbench/scoring";

function createLifecycle(overrides?: {
  getSupabaseAdmin?: () => SupabaseClient<Database> | null;
  loadAttemptMetadata?: (attemptId: string | null) => Promise<Record<string, unknown>>;
  loadAttemptSessions?: (attemptId: string) => Promise<AttemptLifecycleAdvanceSession[]>;
  loadLatestSessionResult?: (sessionId: string) => Promise<HostedWebScoreResult | null>;
  persistScoreResult?: (
    session: AttemptLifecycleSession,
    result: HostedWebScoreResult,
  ) => Promise<PersistScoreResultOutcome>;
  forwardTimeoutCompletion?: (params: { runId: string; summary: string; score?: number }) => Promise<void>;
  evictInMemorySessions?: (sessionIds: string[]) => void;
}) {
  return createAttemptLifecycle({
    now: () => "2026-06-01T00:00:00.000Z",
    getSupabaseAdmin: overrides?.getSupabaseAdmin ?? (() => null),
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
    persistScoreResult:
      overrides?.persistScoreResult ?? (async (_session, result) => ({ result, duplicate: false })),
    forwardTimeoutCompletion: overrides?.forwardTimeoutCompletion ?? (async () => undefined),
    evictInMemorySessions: overrides?.evictInMemorySessions ?? (() => undefined),
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
      return { result: existingResult, duplicate: false };
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

test("complete-session returns the first persisted result after a uniqueness conflict", async () => {
  const persistedResult = makeScoreResult({
    status: "failed",
    score: 0,
    summary: "first completion won",
  });
  const lifecycle = createLifecycle({
    persistScoreResult: async () => ({
      result: persistedResult,
      duplicate: true,
    }),
  });

  const result = await lifecycle.executeCompleteSessionCommand({
    type: "complete-session",
    session: makeSession({ persisted: false }),
    result: makeScoreResult({ summary: "concurrent completion lost" }),
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.result.status, "failed");
  assert.equal(result.result.summary, "first completion won");
});

test("complete-session recovers the first aggregate score after a uniqueness conflict", async () => {
  const persistedAggregate = {
    status: "failed" as const,
    score: 0.25,
    summary: "first aggregate won",
    breakdown: {
      aggregation: "weighted-required-suite" as const,
      sessions: [
        {
          sessionId: "session-1",
          app: "shopping-lite",
          taskSlug: "shopping-constrained-checkout",
          status: "failed" as const,
          score: 0.25,
          weight: 1,
          required: true,
        },
      ],
    },
  };
  let attemptUpdate: Record<string, unknown> | null = null;

  const supabase = {
    from(table: string) {
      if (table === "hosted_web_results") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    session_id: "session-1",
                    app: "shopping-lite",
                    task_slug: "shopping-constrained-checkout",
                    score: 1,
                    status: "passed",
                    weight: 1,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "hosted_web_sessions") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: "session-1",
                    app: "shopping-lite",
                    task_slug: "shopping-constrained-checkout",
                    weight: 1,
                    required: true,
                    sequence_index: 0,
                  },
                ],
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === "benchmark_attempt_scores") {
        return {
          insert: async () => ({ error: { code: "23505" } }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: persistedAggregate, error: null }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { metadata: {} }, error: null }),
          }),
        }),
        update: (value: Record<string, unknown>) => {
          attemptUpdate = value;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  const lifecycle = createLifecycle({
    getSupabaseAdmin: () => supabase,
  });
  const result = await lifecycle.executeCompleteSessionCommand({
    type: "complete-session",
    session: makeSession(),
    result: makeScoreResult(),
  });

  assert.equal(result.attemptResult.complete, true);
  assert.deepEqual(result.attemptResult.aggregate, persistedAggregate);
  const recordedAttemptUpdate = attemptUpdate as Record<string, unknown> | null;
  assert.equal(recordedAttemptUpdate?.status, "failed");
  assert.equal(recordedAttemptUpdate?.aggregate_score, 0.25);
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

function createTimeoutSupabase(options: {
  transitioned: boolean;
  attemptStatus?: string;
  rpcError?: { message: string } | null;
  attemptRunId?: string | null;
  expiredSessionIds?: string[] | null;
}) {
  const rpcCalls: Record<string, unknown>[] = [];
  const supabase = {
    from(table: string) {
      if (table === "benchmark_attempts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { status: options.attemptStatus ?? "running", suite_slug: "hosted-web-suite-v1", metadata: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "hosted_web_sessions") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: "session-1",
                    run_id: "run-1",
                    app: "shopping-lite",
                    task_slug: "shopping-constrained-checkout",
                    sequence_index: 0,
                    status: "active",
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc(_name: string, args: Record<string, unknown>) {
      rpcCalls.push(args);
      return {
        maybeSingle: async () => ({
          data: {
            transitioned: options.transitioned,
            attempt_run_id: options.attemptRunId === undefined ? "run-1" : options.attemptRunId,
            expired_session_ids:
              options.expiredSessionIds === undefined
                ? options.transitioned
                  ? ["session-1"]
                  : []
                : options.expiredSessionIds,
          },
          error: options.rpcError ?? null,
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { supabase, rpcCalls };
}

test("timeout atomically expires sessions and emits completion only for the winning transition", async () => {
  const { supabase, rpcCalls } = createTimeoutSupabase({ transitioned: true });
  const evicted: string[][] = [];
  const callbacks: string[] = [];
  const lifecycle = createLifecycle({
    getSupabaseAdmin: () => supabase,
    evictInMemorySessions: (ids) => evicted.push(ids),
    forwardTimeoutCompletion: async ({ runId }) => {
      callbacks.push(runId);
    },
  });

  const result = await lifecycle.executeTimeoutAttemptCommand({
    type: "timeout-attempt",
    attemptId: "attempt-1",
    runId: "run-1",
    expiredSessionId: "session-1",
    expiredTaskSlug: "shopping-constrained-checkout",
  });

  assert.equal(result.ok, true);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(evicted, [["session-1"]]);
  assert.deepEqual(callbacks, ["run-1"]);
});

test("timeout CAS loser produces no cache or callback side effects", async () => {
  const { supabase } = createTimeoutSupabase({ transitioned: false });
  let sideEffects = 0;
  const lifecycle = createLifecycle({
    getSupabaseAdmin: () => supabase,
    evictInMemorySessions: () => {
      sideEffects += 1;
    },
    forwardTimeoutCompletion: async () => {
      sideEffects += 1;
    },
  });

  const result = await lifecycle.executeTimeoutAttemptCommand({
    type: "timeout-attempt",
    attemptId: "attempt-1",
    runId: "run-1",
    expiredSessionId: "session-1",
    expiredTaskSlug: "shopping-constrained-checkout",
  });

  assert.equal(result.ok, false);
  assert.equal(sideEffects, 0);
});

test("timeout rejects missing persistence and terminal attempts", async () => {
  const unavailable = createLifecycle();
  const input = {
    type: "timeout-attempt" as const,
    attemptId: "attempt-1",
    runId: "run-1",
    expiredSessionId: "session-1",
    expiredTaskSlug: "shopping-constrained-checkout",
  };
  assert.equal((await unavailable.executeTimeoutAttemptCommand(input)).ok, false);

  const { supabase, rpcCalls } = createTimeoutSupabase({ transitioned: false, attemptStatus: "completed" });
  const terminal = createLifecycle({ getSupabaseAdmin: () => supabase });
  assert.equal((await terminal.executeTimeoutAttemptCommand(input)).ok, false);
  assert.equal(rpcCalls.length, 0);
});

test("timeout handles RPC failure without downstream side effects", async () => {
  const { supabase } = createTimeoutSupabase({
    transitioned: false,
    rpcError: { message: "transaction failed" },
  });
  let sideEffects = 0;
  const lifecycle = createLifecycle({
    getSupabaseAdmin: () => supabase,
    evictInMemorySessions: () => {
      sideEffects += 1;
    },
    forwardTimeoutCompletion: async () => {
      sideEffects += 1;
    },
  });

  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await lifecycle.executeTimeoutAttemptCommand({
      type: "timeout-attempt",
      attemptId: "attempt-1",
      runId: "run-1",
      expiredSessionId: "session-1",
      expiredTaskSlug: "shopping-constrained-checkout",
    });
    assert.equal(result.ok, false);
    assert.equal(sideEffects, 0);
  } finally {
    console.error = originalError;
  }
});

test("timeout falls back to discovered sessions and omits callback without a run", async () => {
  const { supabase } = createTimeoutSupabase({
    transitioned: true,
    attemptRunId: null,
    expiredSessionIds: null,
  });
  const evicted: string[][] = [];
  let callbacks = 0;
  const lifecycle = createLifecycle({
    getSupabaseAdmin: () => supabase,
    evictInMemorySessions: (ids) => evicted.push(ids),
    forwardTimeoutCompletion: async () => {
      callbacks += 1;
    },
  });

  const result = await lifecycle.executeTimeoutAttemptCommand({
    type: "timeout-attempt",
    attemptId: "attempt-1",
    runId: null,
    expiredSessionId: "session-1",
    expiredTaskSlug: "shopping-constrained-checkout",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(evicted, [["session-1"]]);
  assert.equal(callbacks, 0);
});
