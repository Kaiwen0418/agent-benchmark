import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCapabilityScores,
  aggregateSuiteScore,
  evaluateScenarioGraph,
  projectScenarioGraphEvaluation,
} from "../../src/index.js";

const capabilities = [
  { id: "research", title: "Research", required: true },
  { id: "recovery", title: "Recovery", required: true },
];

const dimensions = [
  { id: "final-state-correctness" as const, weight: 0.6, required: true },
  { id: "recovery-safety" as const, weight: 0.35, required: true },
  { id: "interaction-cost" as const, weight: 0.05, required: false },
];

function privateGraph() {
  return {
    schemaVersion: 1 as const,
    nodes: [
      {
        id: "research-a",
        taskSlug: "wiki-a",
        kind: "required" as const,
        capabilityIds: ["research"],
        weight: 1,
      },
      {
        id: "research-b",
        taskSlug: "wiki-b",
        kind: "required" as const,
        capabilityIds: ["research"],
        weight: 1,
      },
      {
        id: "decision",
        taskSlug: "notes-decision",
        kind: "required" as const,
        capabilityIds: ["research", "recovery"],
        weight: 1,
      },
      {
        id: "deprecated-source",
        taskSlug: "wiki-old",
        kind: "distractor" as const,
        capabilityIds: ["research"],
        weight: 1,
      },
    ],
    edges: [
      {
        id: "a-to-decision",
        fromNodeId: "research-a",
        toNodeId: "decision",
        relation: "requires" as const,
        required: true,
        weight: 1,
      },
      {
        id: "b-revises-decision",
        fromNodeId: "research-b",
        toNodeId: "decision",
        relation: "revises" as const,
        required: true,
        weight: 1,
      },
    ],
    faultSchedule: [
      {
        id: "stale-decision",
        nodeId: "decision",
        kind: "stale-view" as const,
        trigger: { action: "read" as const, occurrence: 2 },
        maxApplications: 1 as const,
        requiredRecovery: true,
        weight: 1,
      },
    ],
  };
}

test("capability aggregation reports tracks and weighted dimensions without component ids", () => {
  const result = aggregateCapabilityScores({
    capabilities,
    dimensions,
    components: [
      {
        id: "final-research",
        capabilityIds: ["research"],
        dimensionId: "final-state-correctness",
        status: "passed",
        score: 1,
        weight: 1,
        required: true,
      },
      {
        id: "recovered-stale-view",
        capabilityIds: ["recovery"],
        dimensionId: "recovery-safety",
        status: "passed",
        score: 1,
        weight: 1,
        required: true,
      },
      {
        id: "normalized-actions",
        capabilityIds: ["research", "recovery"],
        dimensionId: "interaction-cost",
        status: "failed",
        score: 0.4,
        weight: 1,
        required: false,
      },
    ],
  });

  assert.equal(result.status, "passed");
  assert.equal(result.score, 0.97);
  assert.deepEqual(result.tracks.map((track) => track.id), ["research", "recovery"]);
  assert.equal(JSON.stringify(result).includes("final-research"), false);
  assert.equal(result.dimensions.find((dimension) => dimension.id === "interaction-cost")?.status, "passed");
});

test("capability aggregation fails closed when a required track has no evidence", () => {
  const result = aggregateCapabilityScores({
    capabilities,
    dimensions,
    components: [
      {
        id: "only-research",
        capabilityIds: ["research"],
        dimensionId: "final-state-correctness",
        status: "passed",
        score: 1,
        weight: 1,
        required: true,
      },
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.tracks.find((track) => track.id === "recovery")?.status, "failed");
  assert.equal(result.dimensions.find((dimension) => dimension.id === "recovery-safety")?.status, "failed");
});

test("capability aggregation rejects forged component and weight declarations", () => {
  const component = {
    id: "forged",
    capabilityIds: ["unknown"],
    dimensionId: "final-state-correctness" as const,
    status: "passed" as const,
    score: 1,
    weight: 1,
    required: true,
  };
  assert.throws(
    () => aggregateCapabilityScores({ capabilities, dimensions, components: [component] }),
    /undeclared capability/,
  );
  assert.throws(
    () => aggregateCapabilityScores({
      capabilities: [{ id: "research", title: "Research" }],
      dimensions: [{ id: "final-state-correctness", weight: 0.6 }],
      components: [{ ...component, capabilityIds: ["research"] }],
    }),
    /weights must sum to 1/,
  );
  assert.throws(
    () => aggregateCapabilityScores({
      capabilities: [{ id: "research", title: "Research" }],
      dimensions: [{ id: "final-state-correctness", weight: 1 }],
      components: [
        { ...component, capabilityIds: ["research"] },
        { ...component, capabilityIds: ["research"] },
      ],
    }),
    /components must have unique ids/,
  );
});

test("scenario evaluation verifies branch convergence, revision, recovery, and ignored distractors", () => {
  const evaluated = evaluateScenarioGraph({
    graph: privateGraph(),
    outcomes: [
      { nodeId: "research-a", status: "passed", score: 1 },
      { nodeId: "research-b", status: "passed", score: 1 },
      {
        nodeId: "decision",
        status: "passed",
        score: 1,
        revisedNodeIds: ["research-b"],
        recoveredFaultIds: ["stale-decision"],
      },
    ],
  });
  const projection = projectScenarioGraphEvaluation(evaluated);

  assert.equal(evaluated.status, "passed");
  assert.equal(projection.status, "passed");
  assert.deepEqual(projection.dependencies, { passed: 2, failed: 0, error: 0 });
  assert.deepEqual(projection.recoveries, { passed: 1, failed: 0, error: 0 });
  const publicJson = JSON.stringify(projection);
  assert.equal(publicJson.includes("stale-decision"), false);
  assert.equal(publicJson.includes("research-a"), false);
  assert.equal(publicJson.includes("occurrence"), false);
});

test("scenario evaluation fails closed when a dependency outcome or revision proof is missing", () => {
  const result = evaluateScenarioGraph({
    graph: privateGraph(),
    outcomes: [
      { nodeId: "research-a", status: "passed", score: 1 },
      { nodeId: "decision", status: "passed", score: 1 },
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.nodes.find((node) => node.id === "research-b")?.status, "failed");
  assert.equal(result.dependencies.find((edge) => edge.id === "b-revises-decision")?.status, "failed");
  assert.equal(result.recoveries[0]?.status, "failed");
});

test("scenario evaluation rejects acting on an optional distractor", () => {
  const result = evaluateScenarioGraph({
    graph: privateGraph(),
    outcomes: [
      { nodeId: "research-a", status: "passed", score: 1 },
      { nodeId: "research-b", status: "passed", score: 1 },
      {
        nodeId: "decision",
        status: "passed",
        score: 1,
        revisedNodeIds: ["research-b"],
        recoveredFaultIds: ["stale-decision"],
      },
      { nodeId: "deprecated-source", status: "passed", score: 1 },
    ],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.nodes.find((node) => node.id === "deprecated-source")?.status, "failed");
});

test("scenario evaluation rejects duplicate and out-of-graph outcome claims", () => {
  assert.throws(
    () => evaluateScenarioGraph({
      graph: privateGraph(),
      outcomes: [
        { nodeId: "research-a", status: "passed", score: 1 },
        { nodeId: "research-a", status: "failed", score: 0 },
      ],
    }),
    /at most one result/,
  );
  assert.throws(
    () => evaluateScenarioGraph({
      graph: privateGraph(),
      outcomes: [{ nodeId: "forged-node", status: "passed", score: 1 }],
    }),
    /outside the private graph/,
  );
});

test("suite aggregation uses capability score and gates on the redacted graph result", () => {
  const capabilityResult = aggregateCapabilityScores({
    capabilities: [{ id: "research", title: "Research" }],
    dimensions: [{ id: "final-state-correctness", weight: 1 }],
    components: [{
      id: "answer",
      capabilityIds: ["research"],
      dimensionId: "final-state-correctness",
      status: "passed",
      score: 0.8,
      weight: 1,
      required: true,
    }],
  });
  const graphResult = projectScenarioGraphEvaluation(evaluateScenarioGraph({
    graph: privateGraph(),
    outcomes: [],
  }));
  const result = aggregateSuiteScore({
    sessions: [{
      sessionId: "session-1",
      app: "wiki-lite",
      taskSlug: "wiki-a",
      status: "passed",
      score: 1,
      weight: 1,
      required: true,
    }],
    capabilities: capabilityResult,
    scenarioGraph: graphResult,
  });

  assert.equal(result.score, 0.8);
  assert.equal(result.status, "failed");
  assert.equal(result.breakdown.aggregation, "capability-dimension-weighted-suite");
  assert.equal(result.breakdown.scenarioGraph?.nodes.failed, 3);
});
