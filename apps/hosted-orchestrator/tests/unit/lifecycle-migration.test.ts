import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20260619000014_atomic_attempt_timeout.sql", import.meta.url),
  "utf8",
);
const completionMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260619000015_atomic_session_completion.sql", import.meta.url),
  "utf8",
);
const callbackMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260619000016_callback_outbox.sql", import.meta.url),
  "utf8",
);
const commandDlqMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260619000017_orchestrator_command_dlq.sql", import.meta.url),
  "utf8",
);
const boundedCommandDlqMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260709000028_bound_command_dead_letters.sql", import.meta.url),
  "utf8",
);
const pendingSessionTimeLimitMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260710000029_set_pending_session_time_limit.sql", import.meta.url),
  "utf8",
);
const tenMinuteFallbackMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260710000030_default_session_time_limit_ten_minutes.sql", import.meta.url),
  "utf8",
);
const partialRunNormalizationMigration = readFileSync(
  new URL("../../../../supabase/migrations/20260710000031_finish_scored_partial_runs.sql", import.meta.url),
  "utf8",
);

test("attempt timeout migration keeps lifecycle writes under one row lock", () => {
  assert.match(migration, /for update;/i);
  assert.match(migration, /update public\.hosted_web_sessions/i);
  assert.match(migration, /update public\.benchmark_attempts/i);
  assert.match(migration, /insert into public\.benchmark_attempt_scores/i);
  assert.match(migration, /on conflict \(attempt_id\) do nothing/i);
});

test("attempt timeout RPC is restricted to the service role", () => {
  assert.match(migration, /revoke all .* from authenticated;/i);
  assert.match(migration, /grant execute .* to service_role;/i);
});

test("session completion migration keeps result, progress, promotion, and score under one lock", () => {
  assert.match(completionMigration, /for update;/i);
  assert.match(completionMigration, /insert into public\.hosted_web_results/i);
  assert.match(completionMigration, /update public\.hosted_web_sessions/i);
  assert.match(completionMigration, /update public\.benchmark_attempts/i);
  assert.match(completionMigration, /insert into public\.benchmark_attempt_scores/i);
});

test("session completion validates active ownership and restricts RPC access", () => {
  assert.match(completionMigration, /activeSessionId/);
  assert.match(completionMigration, /session_not_active/);
  assert.match(completionMigration, /grant execute .* to service_role;/i);
});

test("callback outbox is transactionally enqueued and claimed with row locking", () => {
  assert.match(callbackMigration, /after update of status/i);
  assert.match(callbackMigration, /on conflict \(attempt_id, event_type\) do nothing/i);
  assert.match(callbackMigration, /for update skip locked/i);
  assert.match(callbackMigration, /reconcile_hosted_callback_outbox/i);
});

test("command DLQ preserves replay and failure diagnostics", () => {
  assert.match(commandDlqMigration, /command_id text not null unique/i);
  assert.match(commandDlqMigration, /payload_type text not null/i);
  assert.match(commandDlqMigration, /error_code text not null/i);
  assert.match(commandDlqMigration, /status in \('dead', 'replayed', 'resolved'\)/i);
});

test("command DLQ migration redacts history and prunes in bounded batches", () => {
  assert.match(boundedCommandDlqMigration, /redact_orchestrator_command_payload/i);
  assert.match(boundedCommandDlqMigration, /scrub_orchestrator_command_dead_letters/i);
  assert.match(boundedCommandDlqMigration, /where scrubbed_at is null/i);
  assert.match(boundedCommandDlqMigration, /Bearer.*REDACTED/is);
  assert.match(boundedCommandDlqMigration, /for update skip locked/i);
  assert.match(boundedCommandDlqMigration, /least\(coalesce\(p_limit, 500\), 5000\)/i);
  assert.match(boundedCommandDlqMigration, /status = 'dead' and created_at < p_dead_before/i);
  assert.match(boundedCommandDlqMigration, /status in \('replayed', 'resolved'\)/i);
  assert.match(boundedCommandDlqMigration, /grant execute .* to service_role/is);
});

test("pending sessions adopt the ten-minute limit without changing active deadlines", () => {
  assert.match(pendingSessionTimeLimitMigration, /status = 'created'/i);
  assert.match(pendingSessionTimeLimitMigration, /timeLimitMinutesPerTestcase/i);
  assert.match(pendingSessionTimeLimitMigration, /'10'::jsonb/i);
  assert.doesNotMatch(pendingSessionTimeLimitMigration, /status = 'active'/i);
});

test("session promotion falls back to ten minutes when legacy metadata has no limit", () => {
  assert.match(tenMinuteFallbackMigration, /next_time_limit_minutes := coalesce\(/i);
  assert.match(tenMinuteFallbackMigration, /\), 10\);/i);
  assert.doesNotMatch(tenMinuteFallbackMigration, /\), 360\);/i);
});

test("historical partial scores normalize to completed runs without rewriting aggregate errors", () => {
  assert.match(partialRunNormalizationMigration, /status = 'failed'/i);
  assert.match(partialRunNormalizationMigration, /status = 'completed'/i);
  assert.match(partialRunNormalizationMigration, /aggregate_score is not null/i);
  assert.match(partialRunNormalizationMigration, /scoring_summary ->> 'status' = 'failed'/i);
  assert.match(partialRunNormalizationMigration, /hosted_callback_outbox/i);
  assert.doesNotMatch(partialRunNormalizationMigration, /scoring_summary ->> 'status' = 'error'/i);
});
