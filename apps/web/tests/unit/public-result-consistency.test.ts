import assert from "node:assert/strict";
import test from "node:test";
import { summarizePublicConsistencyChecks } from "../../lib/public-result-consistency.js";

test("summarizes required consistency checks separately from session tasks", () => {
  const summary = summarizePublicConsistencyChecks([
    {
      sequenceIndex: 1,
      name: "Wiki answer carried into note",
      sourceTaskSlug: "wiki-hard",
      targetTaskSlug: "notes-hard",
      status: "passed",
      score: 1,
      required: true,
      failureReason: null,
    },
    {
      sequenceIndex: 2,
      name: "Note title carried into calendar",
      sourceTaskSlug: "notes-hard",
      targetTaskSlug: "calendar-hard",
      status: "failed",
      score: 0,
      required: true,
      failureReason: "The required value was not carried consistently between tasks.",
    },
    {
      sequenceIndex: 3,
      name: "Optional display check",
      sourceTaskSlug: "notes-hard",
      targetTaskSlug: "calendar-hard",
      status: "failed",
      score: 0,
      required: false,
      failureReason: "The required value was not carried consistently between tasks.",
    },
  ]);

  assert.deepEqual(summary, { total: 3, requiredTotal: 2, requiredPassed: 1 });
});

test("returns an empty summary for suites without cross-app checks", () => {
  assert.deepEqual(summarizePublicConsistencyChecks([]), {
    total: 0,
    requiredTotal: 0,
    requiredPassed: 0,
  });
});
