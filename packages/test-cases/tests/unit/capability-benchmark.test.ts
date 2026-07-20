import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityMatrixSchema,
  hostedSuiteMetadataSchema,
  hostedWebCapabilitySuiteMetadata,
  hostedWebHardSuiteMetadata,
  hostedWebSuites,
  privateScenarioGraphSchema,
} from "../../src/index.js";

function capabilityMatrix() {
  const releaseResearch = hostedWebHardSuiteMetadata.sessions.find(
    (session) => session.taskSlug === "capability-wiki-release-research",
  )!;
  const policyResearch = hostedWebHardSuiteMetadata.sessions.find(
    (session) => session.taskSlug === "capability-wiki-policy-research",
  )!;
  return {
    schemaVersion: 1 as const,
    capabilities: [
      { id: "research-reconciliation", title: "Research and reconciliation" },
    ],
    dimensions: [
      { id: "final-state-correctness" as const, weight: 1 },
    ],
    coverage: [
      {
        taskSlug: releaseResearch.taskSlug,
        variantId: releaseResearch.metadata.questionVariants[0]!.id,
        capabilityIds: ["research-reconciliation"],
        dimensionIds: ["final-state-correctness" as const],
      },
      {
        taskSlug: policyResearch.taskSlug,
        variantId: policyResearch.metadata.questionVariants[1]!.id,
        capabilityIds: ["research-reconciliation"],
        dimensionIds: ["final-state-correctness" as const],
      },
    ],
  };
}

function scenarioGraph() {
  return {
    schemaVersion: 1 as const,
    nodes: [
      {
        id: "release-research",
        taskSlug: "capability-wiki-release-research",
        capabilityIds: ["research-reconciliation"],
      },
      {
        id: "policy-research",
        taskSlug: "capability-wiki-policy-research",
        capabilityIds: ["research-reconciliation"],
      },
      {
        id: "optional-old-policy",
        taskSlug: "capability-wiki-policy-research",
        kind: "distractor" as const,
        capabilityIds: ["research-reconciliation"],
        avoidanceEvaluatorName: "optional old policy untouched",
      },
    ],
    edges: [
      {
        id: "research-revision",
        fromNodeId: "release-research",
        toNodeId: "policy-research",
        relation: "revises" as const,
        proofEvaluatorName: "policy revision verified",
      },
    ],
    faultSchedule: [
      {
        id: "stale-policy",
        nodeId: "policy-research",
        kind: "stale-view" as const,
        trigger: { action: "read" as const, occurrence: 2 },
      },
    ],
  };
}

test("capability contracts accept two-variant coverage and a deterministic private graph", () => {
  const parsed = hostedSuiteMetadataSchema.parse({
    ...hostedWebHardSuiteMetadata,
    capabilityMatrix: capabilityMatrix(),
    scenarioGraph: scenarioGraph(),
  });

  assert.equal(parsed.capabilityMatrix?.coverage.length, 2);
  assert.equal(parsed.scenarioGraph?.faultSchedule[0]?.maxApplications, 1);
  assert.equal(parsed.scenarioGraph?.nodes[2]?.kind, "distractor");
});

test("revision and distractor graph evidence must name server-owned evaluators", () => {
  const graph = scenarioGraph();
  graph.edges[0]!.proofEvaluatorName = undefined as never;
  graph.nodes.push({
    id: "optional-detour",
    taskSlug: "wiki-policy-answer-hard",
    kind: "distractor",
    capabilityIds: ["research-reconciliation"],
  });
  const parsed = privateScenarioGraphSchema.safeParse(graph);

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.message, /proof evaluator|avoidance evaluator/i);
  }
});

test("capability matrix rejects single-variant dimensions and tracks", () => {
  const matrix = capabilityMatrix();
  matrix.coverage.pop();
  const parsed = capabilityMatrixSchema.safeParse(matrix);

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.message, /at least two independent variants/);
  }
});

test("interaction-cost coverage requires explicit non-gating budgets", () => {
  const matrix = capabilityMatrix();
  matrix.dimensions = [
    { id: "final-state-correctness", weight: 0.9 },
    { id: "interaction-cost", weight: 0.1 },
  ];
  matrix.coverage = matrix.coverage.map((entry) => ({
    ...entry,
    dimensionIds: ["final-state-correctness", "interaction-cost"],
  }));
  const missingBudget = capabilityMatrixSchema.safeParse(matrix);
  assert.equal(missingBudget.success, false);
  if (!missingBudget.success) {
    assert.match(missingBudget.error.message, /requires an action budget|non-gating/);
  }

  const valid = capabilityMatrixSchema.safeParse({
    ...matrix,
    dimensions: [
      { id: "final-state-correctness", weight: 0.9 },
      { id: "interaction-cost", weight: 0.1, required: false },
    ],
    coverage: matrix.coverage.map((entry) => ({
      ...entry,
      interactionBudget: { preferredMaxActions: 8, hardMaxActions: 16 },
    })),
  });
  assert.equal(valid.success, true);
});

test("suite validation rejects capability coverage for an unpublished variant", () => {
  const matrix = capabilityMatrix();
  matrix.coverage[1]!.variantId = "private-unpublished-answer";
  const parsed = hostedSuiteMetadataSchema.safeParse({
    ...hostedWebHardSuiteMetadata,
    capabilityMatrix: matrix,
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.message, /unknown variant/);
  }
});

test("private scenario graph rejects dependency cycles", () => {
  const graph = scenarioGraph();
  graph.edges.push({
    id: "cycle",
    fromNodeId: "policy-research",
    toNodeId: "release-research",
    relation: "requires",
  });
  const parsed = privateScenarioGraphSchema.safeParse(graph);

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.message, /acyclic/);
  }
});

test("private scenario graph rejects ambiguous request-level fault triggers", () => {
  const graph = scenarioGraph();
  graph.faultSchedule.push({
    id: "interrupted-policy",
    nodeId: "policy-research",
    kind: "interrupted-navigation",
    trigger: { action: "navigation", occurrence: 2 },
  });
  const parsed = privateScenarioGraphSchema.safeParse(graph);

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.message, /request occurrence must be unique/);
  }
});

test("a scenario graph cannot exist without its private capability matrix", () => {
  const parsed = hostedSuiteMetadataSchema.safeParse({
    ...hostedWebHardSuiteMetadata,
    capabilityMatrix: undefined,
    scenarioGraph: scenarioGraph(),
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.message, /requires a capability matrix/);
  }
});

test("hard v1.1.0 publishes the covered branching capability campaign", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebCapabilitySuiteMetadata);
  assert.ok(suite.sessions.length >= 7);
  assert.ok(new Set(suite.sessions.map((session) => session.app)).size >= 4);
  assert.ok((suite.capabilityMatrix?.capabilities.length ?? 0) >= 4);

  const covered = new Set(
    suite.capabilityMatrix?.coverage.map((entry) => `${entry.taskSlug}:${entry.variantId}`),
  );
  for (const session of suite.sessions) {
    for (const variant of session.metadata.questionVariants) {
      assert.ok(covered.has(`${session.taskSlug}:${variant.id}`));
    }
  }

  const incomingToHandoff = suite.scenarioGraph?.edges.filter(
    (edge) => edge.toNodeId === "evidence-handoff",
  );
  assert.equal(incomingToHandoff?.length, 2);
  assert.ok(suite.scenarioGraph?.edges.some(
    (edge) => edge.relation === "revises"
      && edge.proofEvaluatorName === "policy revision observed and applied",
  ));
  assert.ok(suite.scenarioGraph?.nodes.some(
    (node) => node.kind === "distractor"
      && node.avoidanceEvaluatorName === "optional unrelated thread untouched",
  ));
  assert.deepEqual(
    suite.scenarioGraph?.faultSchedule.map((fault) => fault.kind).sort(),
    ["interrupted-navigation", "rejected-mutation", "stale-view"],
  );
  assert.equal(
    hostedWebSuites.some((published) => published.metadata.suiteSlug === suite.suiteSlug),
    true,
  );
});
