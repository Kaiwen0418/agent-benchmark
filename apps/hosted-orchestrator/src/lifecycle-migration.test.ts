import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260619000014_atomic_attempt_timeout.sql", import.meta.url),
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
