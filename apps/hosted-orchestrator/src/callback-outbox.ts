import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@agentbench/shared";

type SupabaseCallbackOutboxRow = Database["public"]["Tables"]["hosted_callback_outbox"]["Row"];

export type CallbackOutboxRow = {
  id: string;
  attemptId: string;
  runId: string;
  eventType: string;
  payload: unknown;
  status: "pending" | "delivering" | "delivered" | "dead";
  attempts: number;
  nextAttemptAt: string;
  lockedAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CallbackOutboxPersistence = {
  reconcile: () => Promise<number>;
  claim: (limit: number) => Promise<CallbackOutboxRow[]>;
  markDelivered: (id: string, deliveredAt: string) => Promise<void>;
  markFailed: (input: {
    id: string;
    status: "pending" | "dead";
    nextAttemptAt: string;
    lastError: string;
    updatedAt: string;
  }) => Promise<void>;
};

type CallbackOutboxDeps = {
  getSupabaseAdmin: () => SupabaseClient<Database> | null | undefined;
  getPersistence?: () => CallbackOutboxPersistence | null;
  webBaseUrl: string | null;
  sharedSecret: string | null;
  fetchFn?: typeof fetch;
  now?: () => Date;
};

export type CallbackDeliverySummary = {
  reconciled: number;
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
};

const maxAttempts = 8;

function retryDelayMs(attempts: number) {
  return Math.min(300_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

export function createCallbackOutboxProcessor(deps: CallbackOutboxDeps) {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => new Date());

  function mapSupabaseRow(row: SupabaseCallbackOutboxRow): CallbackOutboxRow {
    return {
      id: row.id,
      attemptId: row.attempt_id,
      runId: row.run_id,
      eventType: row.event_type,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      lockedAt: row.locked_at,
      deliveredAt: row.delivered_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function getPersistence(): CallbackOutboxPersistence | null {
    const persistence = deps.getPersistence?.();
    if (persistence) return persistence;
    const supabase = deps.getSupabaseAdmin();
    if (!supabase) return null;
    return {
      async reconcile() {
        const { data, error } = await supabase.rpc("reconcile_hosted_callback_outbox");
        if (error) throw error;
        return data ?? 0;
      },
      async claim(limit) {
        const { data, error } = await supabase.rpc("claim_hosted_callback_outbox", { p_limit: limit });
        if (error) throw error;
        return (data ?? []).map(mapSupabaseRow);
      },
      async markDelivered(id, deliveredAt) {
        const { error } = await supabase.from("hosted_callback_outbox").update({
          status: "delivered",
          delivered_at: deliveredAt,
          locked_at: null,
          last_error: null,
          updated_at: deliveredAt,
        }).eq("id", id).eq("status", "delivering");
        if (error) throw error;
      },
      async markFailed(input) {
        const { error } = await supabase.from("hosted_callback_outbox").update({
          status: input.status,
          next_attempt_at: input.nextAttemptAt,
          locked_at: null,
          last_error: input.lastError,
          updated_at: input.updatedAt,
        }).eq("id", input.id).eq("status", "delivering");
        if (error) throw error;
      },
    };
  }

  async function markDelivered(persistence: CallbackOutboxPersistence, row: CallbackOutboxRow) {
    const deliveredAt = now().toISOString();
    await persistence.markDelivered(row.id, deliveredAt);
  }

  async function markFailed(persistence: CallbackOutboxPersistence, row: CallbackOutboxRow, failure: unknown) {
    const failedAt = now();
    const dead = row.attempts >= maxAttempts;
    await persistence.markFailed({
      id: row.id,
      status: dead ? "dead" : "pending",
      nextAttemptAt: new Date(failedAt.getTime() + retryDelayMs(row.attempts)).toISOString(),
      lastError: errorMessage(failure),
      updatedAt: failedAt.toISOString(),
    });
    return dead;
  }

  async function process(limit = 20, reconcile = false): Promise<CallbackDeliverySummary> {
    const summary: CallbackDeliverySummary = { reconciled: 0, claimed: 0, delivered: 0, retried: 0, dead: 0 };
    const persistence = getPersistence();
    if (!persistence || !deps.webBaseUrl) {
      return summary;
    }

    if (reconcile) {
      summary.reconciled = await persistence.reconcile();
    }

    const rows = await persistence.claim(Math.max(1, Math.min(limit, 100)));
    summary.claimed = rows.length;

    for (const row of rows) {
      try {
        const response = await fetchFn(
          `${deps.webBaseUrl}/api/runs/${encodeURIComponent(row.runId)}/complete`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(deps.sharedSecret ? { "x-runner-secret": deps.sharedSecret } : {}),
            },
            body: JSON.stringify(row.payload),
          },
        );
        if (!response.ok) {
          throw new Error(`Web completion callback returned HTTP ${response.status}.`);
        }
        await markDelivered(persistence, row);
        summary.delivered += 1;
      } catch (error) {
        if (await markFailed(persistence, row, error)) {
          summary.dead += 1;
        } else {
          summary.retried += 1;
        }
      }
    }

    return summary;
  }

  return { process };
}
