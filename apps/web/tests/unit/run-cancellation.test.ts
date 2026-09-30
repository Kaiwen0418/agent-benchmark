import assert from "node:assert/strict";
import test from "node:test";
import type { BenchmarkRun } from "@agentbench/protocol";
import { isRunOwnedBy } from "../../lib/run-cancellation";

function run(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: null,
    guestId: "guest-owner",
    caseId: "00000000-0000-4000-8000-000000000002",
    runnerId: null,
    executionMode: "external-agent",
    status: "running",
    score: null,
    liveViewUrl: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-09-30T12:00:00.000Z",
    metadata: {},
    agent: null,
    browserEnvironment: null,
    isPublic: true,
    ...overrides,
  };
}

test("run cancellation ownership isolates users and guests", () => {
  assert.equal(isRunOwnedBy(run(), { guestId: "guest-owner" }), true);
  assert.equal(isRunOwnedBy(run(), { guestId: "guest-other" }), false);
  assert.equal(isRunOwnedBy(run({ userId: "user-owner" }), { userId: "user-owner" }), true);
  assert.equal(isRunOwnedBy(run({ userId: "user-owner" }), { userId: "user-other" }), false);
  assert.equal(isRunOwnedBy(run({ userId: "user-owner" }), { guestId: "guest-owner" }), false);
});
