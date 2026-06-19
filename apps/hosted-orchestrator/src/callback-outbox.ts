import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@agentbench/shared";

type CallbackOutboxRow = Database["public"]["Tables"]["hosted_callback_outbox"]["Row"];

type CallbackOutboxDeps = {
  getSupabaseAdmin: () => SupabaseClient<Database> | null | undefined;
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

  async function markDelivered(supabase: SupabaseClient<Database>, row: CallbackOutboxRow) {
    const deliveredAt = now().toISOString();
    const { error } = await supabase
      .from("hosted_callback_outbox")
      .update({
        status: "delivered",
        delivered_at: deliveredAt,
        locked_at: null,
        last_error: null,
        updated_at: deliveredAt,
      })
      .eq("id", row.id)
      .eq("status", "delivering");
    if (error) {
      throw error;
    }
  }

  async function markFailed(supabase: SupabaseClient<Database>, row: CallbackOutboxRow, failure: unknown) {
    const failedAt = now();
    const dead = row.attempts >= maxAttempts;
    const { error } = await supabase
      .from("hosted_callback_outbox")
      .update({
        status: dead ? "dead" : "pending",
        next_attempt_at: new Date(failedAt.getTime() + retryDelayMs(row.attempts)).toISOString(),
        locked_at: null,
        last_error: errorMessage(failure),
        updated_at: failedAt.toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "delivering");
    if (error) {
      throw error;
    }
    return dead;
  }

  async function process(limit = 20, reconcile = false): Promise<CallbackDeliverySummary> {
    const summary: CallbackDeliverySummary = { reconciled: 0, claimed: 0, delivered: 0, retried: 0, dead: 0 };
    const supabase = deps.getSupabaseAdmin();
    if (!supabase || !deps.webBaseUrl) {
      return summary;
    }

    if (reconcile) {
      const { data: reconciled, error: reconcileError } = await supabase.rpc("reconcile_hosted_callback_outbox");
      if (reconcileError) {
        throw reconcileError;
      }
      summary.reconciled = reconciled ?? 0;
    }

    const { data: rows, error: claimError } = await supabase.rpc("claim_hosted_callback_outbox", {
      p_limit: Math.max(1, Math.min(limit, 100)),
    });
    if (claimError) {
      throw claimError;
    }
    summary.claimed = rows?.length ?? 0;

    for (const row of rows ?? []) {
      try {
        const response = await fetchFn(
          `${deps.webBaseUrl}/api/runs/${encodeURIComponent(row.run_id)}/complete`,
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
        await markDelivered(supabase, row);
        summary.delivered += 1;
      } catch (error) {
        if (await markFailed(supabase, row, error)) {
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
