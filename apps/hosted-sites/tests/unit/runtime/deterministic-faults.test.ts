import assert from "node:assert/strict";
import test from "node:test";
import { observeDeterministicFault } from "../../../src/runtime/deterministic-faults.js";

function metadata() {
  return {
    scenarioFaultSchedule: {
      schemaVersion: 1,
      faults: [{
        id: "reject-save",
        nodeId: "decision",
        kind: "rejected-mutation",
        trigger: { action: "mutation", occurrence: 2 },
        maxApplications: 1,
        requiredRecovery: true,
        weight: 1,
      }],
    },
  } satisfies Record<string, unknown>;
}

test("injects a scheduled fault once and records recovery on retry", () => {
  const sessionMetadata = metadata();

  assert.deepEqual(observeDeterministicFault(sessionMetadata, ["mutation"]), {
    changed: true,
    injected: null,
    recovered: null,
  });
  assert.deepEqual(observeDeterministicFault(sessionMetadata, ["mutation"]), {
    changed: true,
    injected: { kind: "rejected-mutation" },
    recovered: null,
  });
  assert.deepEqual(observeDeterministicFault(sessionMetadata, ["mutation"]), {
    changed: true,
    injected: null,
    recovered: { kind: "rejected-mutation" },
  });
  assert.equal(observeDeterministicFault(sessionMetadata, ["mutation"]).injected, null);

  const state = (sessionMetadata as Record<string, unknown>).scenarioFaultState as Record<string, unknown>;
  assert.deepEqual(state.appliedFaultIds, ["reject-save"]);
  assert.deepEqual(state.recoveredFaultIds, ["reject-save"]);
  assert.equal(state.pendingRecoveryFaultId, null);
});

test("counts read and navigation independently for one browser GET", () => {
  const sessionMetadata = {
    scenarioFaultSchedule: {
      schemaVersion: 1,
      faults: [{
        id: "stale-read",
        nodeId: "research",
        kind: "stale-view",
        trigger: { action: "read", occurrence: 2 },
        maxApplications: 1,
        requiredRecovery: true,
        weight: 1,
      }],
    },
  } satisfies Record<string, unknown>;

  assert.equal(observeDeterministicFault(sessionMetadata, ["navigation", "read"]).injected, null);
  assert.deepEqual(observeDeterministicFault(sessionMetadata, ["navigation", "read"]).injected, {
    kind: "stale-view",
  });
  const state = (sessionMetadata as Record<string, unknown>).scenarioFaultState as Record<string, unknown>;
  assert.deepEqual(state.occurrences, { read: 2, mutation: 0, navigation: 2 });
});

test("leaves legacy and malformed schedules unchanged", () => {
  const legacy = {} satisfies Record<string, unknown>;
  const malformed = { scenarioFaultSchedule: { schemaVersion: 1, faults: [{}] } } satisfies Record<string, unknown>;

  assert.deepEqual(observeDeterministicFault(legacy, ["read"]), {
    changed: false,
    injected: null,
    recovered: null,
  });
  assert.deepEqual(observeDeterministicFault(malformed, ["read"]), {
    changed: false,
    injected: null,
    recovered: null,
  });
  assert.equal("scenarioFaultState" in legacy, false);
  assert.equal("scenarioFaultState" in malformed, false);
});
