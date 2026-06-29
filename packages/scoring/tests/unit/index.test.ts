import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateStrictScore,
  aggregateSuiteScore,
  evaluateSuiteConsistency,
  failedEvaluator,
  passedEvaluator,
  suiteConsistencyCheckSchema,
  type HostedWebEvaluatorResult,
  type SuiteConsistencyCheck,
} from "../../src/index.js";

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

function chain(overrides: Partial<SuiteConsistencyCheck> = {}): SuiteConsistencyCheck {
  return suiteConsistencyCheckSchema.parse({
    name: "release version carried into note",
    sourceTaskSlug: "wiki-release-answer-hard",
    sourcePath: "latestAnswer",
    targetTaskSlug: "notes-followup-create-hard",
    targetPath: "notes[].title",
    rule: "target-contains-source",
    ...overrides,
  });
}

test("evaluateSuiteConsistency passes when the agent carries the value across sessions", () => {
  const states = new Map<string, unknown>([
    ["wiki-release-answer-hard", { app: "wiki-lite", latestAnswer: "2.4.0" }],
    [
      "notes-followup-create-hard",
      { app: "notes-lite", notes: [{ title: "Plan upgrade to 2.4.0", body: "..." }] },
    ],
  ]);

  const [result] = evaluateSuiteConsistency([chain()], states);
  assert.equal(result!.status, "passed");
  assert.equal(result!.score, 1);
  assert.equal(result!.evidence?.matchedValue, "2.4.0");
});

test("evaluateSuiteConsistency fails on a consistency mismatch", () => {
  const states = new Map<string, unknown>([
    ["wiki-release-answer-hard", { app: "wiki-lite", latestAnswer: "2.4.0" }],
    [
      "notes-followup-create-hard",
      { app: "notes-lite", notes: [{ title: "Plan upgrade to 1.0.0" }] },
    ],
  ]);

  const [result] = evaluateSuiteConsistency([chain()], states);
  assert.equal(result!.status, "failed");
  assert.equal(result!.score, 0);
  assert.equal(result!.evidence?.sourceFound, true);
  assert.equal(result!.evidence?.targetFound, true);
});

test("evaluateSuiteConsistency reports missing prior output when a session is absent", () => {
  const states = new Map<string, unknown>([
    ["notes-followup-create-hard", { app: "notes-lite", notes: [{ title: "Plan upgrade" }] }],
  ]);

  const [result] = evaluateSuiteConsistency([chain()], states);
  assert.equal(result!.status, "failed");
  assert.equal(result!.evidence?.sourceFound, false);
  assert.match(result!.errorMessage ?? "", /Missing prior output/);
});

test("evaluateSuiteConsistency equal-normalized ignores case and surrounding whitespace", () => {
  const states = new Map<string, unknown>([
    ["a", { value: "  Release 2.4.0 " }],
    ["b", { value: "release 2.4.0" }],
  ]);

  const [result] = evaluateSuiteConsistency(
    [
      chain({
        name: "exact",
        sourceTaskSlug: "a",
        sourcePath: "value",
        targetTaskSlug: "b",
        targetPath: "value",
        rule: "equal-normalized",
      }),
    ],
    states,
  );
  assert.equal(result!.status, "passed");
});

test("aggregateSuiteScore folds a failed required consistency check into status and score", () => {
  const sessions = [
    {
      sessionId: "session-1",
      app: "wiki-lite",
      taskSlug: "wiki-release-answer-hard",
      status: "passed" as const,
      score: 1,
      weight: 1,
      required: true,
    },
    {
      sessionId: "session-2",
      app: "notes-lite",
      taskSlug: "notes-followup-create-hard",
      status: "passed" as const,
      score: 1,
      weight: 1,
      required: true,
    },
  ];

  const passing = aggregateSuiteScore({
    sessions,
    consistency: evaluateSuiteConsistency(
      [chain()],
      new Map<string, unknown>([
        ["wiki-release-answer-hard", { latestAnswer: "2.4.0" }],
        ["notes-followup-create-hard", { notes: [{ title: "Upgrade to 2.4.0" }] }],
      ]),
    ),
  });
  assert.equal(passing.status, "passed");
  assert.equal(passing.score, 1);
  assert.equal(passing.breakdown.consistency?.length, 1);

  const failing = aggregateSuiteScore({
    sessions,
    consistency: evaluateSuiteConsistency(
      [chain()],
      new Map<string, unknown>([
        ["wiki-release-answer-hard", { latestAnswer: "2.4.0" }],
        ["notes-followup-create-hard", { notes: [{ title: "Upgrade to 9.9.9" }] }],
      ]),
    ),
  });
  // Two passed sessions (weight 1 each) + one failed consistency check (weight 1)
  // => weighted score 2/3, suite fails because a required check failed.
  assert.equal(failing.status, "failed");
  assert.equal(failing.score, 0.6667);
});
