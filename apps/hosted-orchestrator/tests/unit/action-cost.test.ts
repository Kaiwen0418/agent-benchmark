import assert from "node:assert/strict";
import test from "node:test";
import { collectNormalizedActionCosts } from "../../src/action-cost.js";

test("normalizes repeated input telemetry into field edit bursts", () => {
  const costs = collectNormalizedActionCosts([
    { sessionId: "s1", type: "page.load", payload: {} },
    { sessionId: "s1", type: "click", payload: { payload: { tag: "INPUT", name: "title" } } },
    { sessionId: "s1", type: "input", payload: { payload: { tag: "INPUT", name: "title", valuePreview: "a" } } },
    { sessionId: "s1", type: "input", payload: { payload: { tag: "INPUT", name: "title", valuePreview: "answer" } } },
    { sessionId: "s1", type: "input", payload: { payload: { tag: "TEXTAREA", name: "body" } } },
    { sessionId: "s1", type: "submit", payload: {} },
  ]);

  assert.equal(costs.get("s1"), 5);
});

test("keeps session bursts independent and ignores non-action server events", () => {
  const costs = collectNormalizedActionCosts([
    { sessionId: "s1", type: "input", payload: { payload: { name: "query" } } },
    { sessionId: "s2", type: "page.load", payload: {} },
    { sessionId: "s1", type: "task.signal", payload: { private: "ignored" } },
    { sessionId: "s1", type: "scenario.fault_recovered", payload: {} },
    { sessionId: "s1", type: "input", payload: { payload: { name: "query" } } },
    { sessionId: "s2", type: "unknown", payload: {} },
  ]);

  assert.equal(costs.get("s1"), 1);
  assert.equal(costs.get("s2"), 1);
  assert.equal(costs.has("missing"), false);
});

test("returns no score evidence for sessions without cost-bearing telemetry", () => {
  const costs = collectNormalizedActionCosts([
    { sessionId: "s1", type: "task.signal", payload: {} },
    { sessionId: "s1", type: "scenario.fault_applied", payload: {} },
  ]);

  assert.equal(costs.has("s1"), false);
});
