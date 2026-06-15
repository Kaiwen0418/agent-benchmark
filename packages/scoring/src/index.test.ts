import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateStrictScore,
  aggregateSuiteScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
} from "./index.js";

function errorEvaluator(): HostedWebEvaluatorResult {
  return {
    type: "backend_state",
    name: "backend errored",
    score: 0,
    status: "error",
    required: true,
    errorMessage: "database unavailable",
  };
}

test("aggregateStrictScore passes only when all required evaluators pass", () => {
  const result = aggregateStrictScore({
    evaluators: [
      passedEvaluator({ type: "backend_state", name: "order exists" }),
      failedEvaluator({
        type: "final_response",
        name: "agent reported order id",
        required: false,
        errorMessage: "final response is optional",
      }),
    ],
    passSummary: "passed",
    failSummary: "failed",
  });

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
  assert.equal(result.summary, "passed");
});

test("aggregateStrictScore fails when any required evaluator fails", () => {
  const result = aggregateStrictScore({
    evaluators: [
      passedEvaluator({ type: "retrieve_value", name: "answer matches" }),
      failedEvaluator({
        type: "backend_state",
        name: "submission persisted",
        errorMessage: "missing submission",
      }),
    ],
    passSummary: "passed",
    failSummary: "failed",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
  assert.equal(result.summary, "failed");
});

test("aggregateStrictScore returns error when a required evaluator errors", () => {
  const result = aggregateStrictScore({
    evaluators: [errorEvaluator()],
    passSummary: "passed",
    failSummary: "failed",
  });

  assert.equal(result.status, "error");
  assert.equal(result.score, 0);
});

test("aggregateSuiteScore uses weighted score when all required sessions pass", () => {
  const result = aggregateSuiteScore({
    sessions: [
      {
        sessionId: "session-1",
        app: "shopping-lite",
        taskSlug: "shopping-constrained-checkout",
        status: "passed",
        score: 1,
        weight: 3,
        required: true,
      },
      {
        sessionId: "session-2",
        app: "wiki-lite",
        taskSlug: "wiki-release-answer",
        status: "passed",
        score: 0.5,
        weight: 1,
        required: false,
      },
    ],
  });

  assert.equal(result.status, "passed");
  assert.equal(result.score, 0.875);
  assert.equal(result.breakdown.aggregation, "weighted-required-suite");
});

test("aggregateSuiteScore preserves earned weighted score when a required session fails", () => {
  const result = aggregateSuiteScore({
    sessions: [
      {
        sessionId: "session-1",
        app: "shopping-lite",
        taskSlug: "shopping-constrained-checkout",
        status: "passed",
        score: 1,
        weight: 1,
        required: true,
      },
      {
        sessionId: "session-2",
        app: "repo-lite",
        taskSlug: "repo-readme-fix",
        status: "failed",
        score: 0,
        weight: 1,
        required: true,
      },
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0.5);
  assert.equal(result.status, "failed");
});
