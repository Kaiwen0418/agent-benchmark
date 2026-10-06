import assert from "node:assert/strict";
import test from "node:test";
import {
  compactCommandPayload,
  pruneCommandDeadLetters,
  redactCommandErrorMessage,
  redactCommandPayload,
  scrubCommandDeadLetters,
  type CommandDeadLetterMaintenancePersistence,
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

test("replaces oversized command payloads with compact diagnostics", () => {
  const compacted = compactCommandPayload({
    runId: "run-1",
    callbackSecret: "secret-value",
    evidence: "x".repeat(1_000),
  }, 100);

  assert.deepEqual(compacted, {
    truncated: true,
    originalBytes: 1031,
    topLevelKeys: ["runId", "evidence"],
  });
  assert.doesNotMatch(JSON.stringify(compacted), /secret-value/);
});

test("prunes command dead letters across a bounded number of batches", async () => {
  const calls: Record<string, unknown>[] = [];
  const batchResults = [500, 500, 37];
  const persistence: CommandDeadLetterMaintenancePersistence = {
    prune: async (input) => {
      calls.push(input);
      return batchResults.shift() ?? 0;
    },
    scrub: async () => 0,
  };

  const deleted = await pruneCommandDeadLetters(
    persistence,
    {
      deadRetentionMs: 90 * 24 * 60 * 60 * 1_000,
      resolvedRetentionMs: 30 * 24 * 60 * 60 * 1_000,
      batchSize: 500,
      maxBatches: 5,
      maxRows: 10_000,
    },
    Date.parse("2026-07-09T00:00:00.000Z"),
  );

  assert.equal(deleted, 1_037);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], {
    deadBefore: "2026-04-10T00:00:00.000Z",
    resolvedBefore: "2026-06-09T00:00:00.000Z",
    limit: 500,
    maxRows: 10_000,
  });
});

test("stops command dead-letter pruning at the configured sweep budget", async () => {
  let calls = 0;
  const persistence: CommandDeadLetterMaintenancePersistence = {
    async prune() {
      calls += 1;
      return 100;
    },
    scrub: async () => 0,
  };

  const deleted = await pruneCommandDeadLetters(persistence, {
    deadRetentionMs: 1,
    resolvedRetentionMs: 1,
    batchSize: 100,
    maxBatches: 3,
    maxRows: 1_000,
  });

  assert.equal(deleted, 300);
  assert.equal(calls, 3);
});

test("scrubs historical command dead letters in bounded batches", async () => {
  const calls: number[] = [];
  const persistence: CommandDeadLetterMaintenancePersistence = {
    prune: async () => 0,
    scrub: async (limit) => {
      calls.push(limit);
      return 500;
    },
  };

  assert.equal(await scrubCommandDeadLetters(persistence, 500), 500);
  assert.deepEqual(calls, [500]);
});
