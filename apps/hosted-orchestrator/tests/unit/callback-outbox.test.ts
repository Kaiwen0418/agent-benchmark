import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@agentbench/shared";
import { createCallbackOutboxProcessor } from "../../src/callback-outbox.js";

type OutboxRow = Database["public"]["Tables"]["hosted_callback_outbox"]["Row"];

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "outbox-1",
    attempt_id: "attempt-1",
    run_id: "run-1",
    event_type: "run_completion",
    payload: { status: "completed", score: 1, errorMessage: null, artifacts: [] },
    status: "delivering",
    attempts: 1,
    next_attempt_at: "2026-06-19T00:00:00.000Z",
    locked_at: "2026-06-19T00:00:00.000Z",
    delivered_at: null,
    last_error: null,
    created_at: "2026-06-19T00:00:00.000Z",
    updated_at: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}

function createSupabase(rows: OutboxRow[]) {
  const updates: Record<string, unknown>[] = [];
  const supabase = {
    rpc(name: string) {
      if (name === "reconcile_hosted_callback_outbox") {
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: rows, error: null });
    },
    from(table: string) {
      assert.equal(table, "hosted_callback_outbox");
      return {
        update(value: Record<string, unknown>) {
          updates.push(value);
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { supabase, updates };
}

test("callback outbox marks successful delivery", async () => {
  const { supabase, updates } = createSupabase([makeRow()]);
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const processor = createCallbackOutboxProcessor({
    getSupabaseAdmin: () => supabase,
    webBaseUrl: "https://web.example",
    sharedSecret: "secret",
    now: () => new Date("2026-06-19T01:00:00.000Z"),
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    },
  });

  const summary = await processor.process(20, true);
  assert.deepEqual(summary, { reconciled: 1, claimed: 1, delivered: 1, retried: 0, dead: 0 });
  assert.equal(requests[0]?.url, "https://web.example/api/runs/run-1/complete");
  assert.equal((requests[0]?.init?.headers as Record<string, string>)["x-runner-secret"], "secret");
  assert.equal(updates[0]?.status, "delivered");
});

test("callback outbox reschedules failed delivery with bounded backoff", async () => {
  const { supabase, updates } = createSupabase([makeRow({ attempts: 3 })]);
  const processor = createCallbackOutboxProcessor({
    getSupabaseAdmin: () => supabase,
    webBaseUrl: "https://web.example",
    sharedSecret: null,
    now: () => new Date("2026-06-19T01:00:00.000Z"),
    fetchFn: async () => new Response(null, { status: 503 }),
  });

  const summary = await processor.process();
  assert.equal(summary.retried, 1);
  assert.equal(updates[0]?.status, "pending");
  assert.equal(updates[0]?.next_attempt_at, "2026-06-19T01:00:04.000Z");
  assert.match(String(updates[0]?.last_error), /HTTP 503/);
});

test("callback outbox dead-letters the eighth failed attempt", async () => {
  const { supabase, updates } = createSupabase([makeRow({ attempts: 8 })]);
  const processor = createCallbackOutboxProcessor({
    getSupabaseAdmin: () => supabase,
    webBaseUrl: "https://web.example",
    sharedSecret: null,
    fetchFn: async () => {
      throw new Error("network unavailable");
    },
  });

  const summary = await processor.process();
  assert.equal(summary.dead, 1);
  assert.equal(updates[0]?.status, "dead");
});

test("callback outbox is inert without persistence or Web URL", async () => {
  const processor = createCallbackOutboxProcessor({
    getSupabaseAdmin: () => null,
    webBaseUrl: null,
    sharedSecret: null,
  });
  assert.deepEqual(await processor.process(), {
    reconciled: 0,
    claimed: 0,
    delivered: 0,
    retried: 0,
    dead: 0,
  });
});
