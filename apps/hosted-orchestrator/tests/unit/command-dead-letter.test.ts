import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@agentbench/shared";
import {
  pruneCommandDeadLetters,
  redactCommandErrorMessage,
  redactCommandPayload,
  scrubCommandDeadLetters,
} from "../../src/command-dead-letter.js";

test("redacts sensitive command payload keys recursively", () => {
  assert.deepEqual(
    redactCommandPayload({
      runId: "run-1",
      callbackSecret: "callback-value",
      nested: {
        session_token: "session-value",
        evidence: [{
          writeToken: "write-value",
          score: 1,
          url: "https://hosted.example/task?session=url-token",
        }],
      },
    }),
    {
      runId: "run-1",
      nested: {
        evidence: [{ score: 1, url: "https://hosted.example/task?session=[REDACTED]" }],
      },
    },
  );
});

test("redacts secrets from command error messages", () => {
  const message =
    "request failed?session=abc123 callbackSecret=secret-value Authorization: Bearer bearer-value";
  const redacted = redactCommandErrorMessage(message);

  assert.doesNotMatch(redacted, /abc123|secret-value|bearer-value/);
  assert.match(redacted, /\[REDACTED\]/);
});

test("prunes command dead letters with bounded retention cutoffs", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: 37, error: null });
    },
  } as unknown as SupabaseClient<Database>;

  const deleted = await pruneCommandDeadLetters(
    supabase,
    {
      deadRetentionMs: 90 * 24 * 60 * 60 * 1_000,
      resolvedRetentionMs: 30 * 24 * 60 * 60 * 1_000,
      batchSize: 500,
    },
    Date.parse("2026-07-09T00:00:00.000Z"),
  );

  assert.equal(deleted, 37);
  assert.deepEqual(calls, [{
    name: "prune_orchestrator_command_dead_letters",
    args: {
      p_dead_before: "2026-04-10T00:00:00.000Z",
      p_resolved_before: "2026-06-09T00:00:00.000Z",
      p_limit: 500,
    },
  }]);
});

test("scrubs historical command dead letters in bounded batches", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: 500, error: null });
    },
  } as unknown as SupabaseClient<Database>;

  assert.equal(await scrubCommandDeadLetters(supabase, 500), 500);
  assert.deepEqual(calls, [{
    name: "scrub_orchestrator_command_dead_letters",
    args: { p_limit: 500 },
  }]);
});
