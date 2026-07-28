import assert from "node:assert/strict";
import test from "node:test";
import type { PrivateScenarioGraph } from "@agentbench/test-cases";
import { buildSessionScenarioFaultSchedule } from "../../src/scenario-runtime.js";

const graph: PrivateScenarioGraph = {
  schemaVersion: 1,
  nodes: [
    { id: "research", taskSlug: "wiki-research", kind: "required", capabilityIds: ["research"], weight: 1 },
    { id: "decision", taskSlug: "notes-decision", kind: "required", capabilityIds: ["recovery"], weight: 1 },
  ],
  edges: [],
  faultSchedule: [
    {
      id: "stale-research",
      nodeId: "research",
      kind: "stale-view",
      trigger: { action: "read", occurrence: 2 },
      maxApplications: 1,
      requiredRecovery: true,
      weight: 1,
    },
    {
      id: "reject-decision",
      nodeId: "decision",
      kind: "rejected-mutation",
      trigger: { action: "mutation", occurrence: 1 },
      maxApplications: 1,
      requiredRecovery: true,
      weight: 1,
    },
  ],
};

test("projects only the current task fault schedule into session metadata", () => {
  const schedule = buildSessionScenarioFaultSchedule(graph, "notes-decision");

  assert.equal(schedule?.schemaVersion, 1);
  assert.deepEqual(schedule?.faults.map((fault) => fault.id), ["reject-decision"]);
  assert.equal(JSON.stringify(schedule).includes("stale-research"), false);
});

test("omits scenario runtime metadata when a task has no scheduled fault", () => {
  assert.equal(buildSessionScenarioFaultSchedule(graph, "calendar-final"), undefined);
  assert.equal(buildSessionScenarioFaultSchedule(undefined, "notes-decision"), undefined);
});
