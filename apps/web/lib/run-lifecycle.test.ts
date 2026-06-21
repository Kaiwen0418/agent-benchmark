import assert from "node:assert/strict";
import test from "node:test";
import { runStatusSchema } from "@agentbench/protocol";
import { completableRunStatuses, terminalRunStatuses } from "./run-lifecycle";

test("every run status is either completable or terminal", () => {
  const completable = new Set(completableRunStatuses);

  for (const status of runStatusSchema.options) {
    assert.notEqual(
      completable.has(status),
      terminalRunStatuses.has(status),
      `${status} must belong to exactly one lifecycle group`,
    );
  }
});

test("hosted agent-connected runs accept completion callbacks", () => {
  assert.ok(completableRunStatuses.includes("agent_connected"));
});
