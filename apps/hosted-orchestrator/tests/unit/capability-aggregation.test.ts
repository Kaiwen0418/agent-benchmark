import assert from "node:assert/strict";
import test from "node:test";
import { hostedWebCapabilitySuiteMetadata } from "@agentbench/test-cases";
import { buildCapabilityAttemptEvaluation } from "../../src/capability-aggregation.js";

const capabilityMatrix = {
  schemaVersion: 1,
  capabilities: [
    { id: "research", title: "Research" },
    { id: "recovery", title: "Recovery" },
  ],
  dimensions: [
    { id: "final-state-correctness", weight: 0.6 },
    { id: "dependency-consistency", weight: 0.15 },
    { id: "evidence-verification", weight: 0.1 },
    { id: "recovery-safety", weight: 0.1 },
    { id: "interaction-cost", weight: 0.05, required: false },
  ],
  coverage: [
    ...["research-a", "research-b"].map((variantId) => ({
      taskSlug: "wiki-research",
      variantId,
      capabilityIds: ["research"],
      dimensionIds: ["final-state-correctness", "evidence-verification", "interaction-cost"],
      interactionBudget: { preferredMaxActions: 8, hardMaxActions: 16 },
    })),
    ...["decision-a", "decision-b"].map((variantId) => ({
      taskSlug: "notes-decision",
      variantId,
      capabilityIds: ["recovery"],
      dimensionIds: ["final-state-correctness", "dependency-consistency", "recovery-safety", "interaction-cost"],
      interactionBudget: { preferredMaxActions: 8, hardMaxActions: 16 },
    })),
  ],
};

const scenarioGraph = {
  schemaVersion: 1,
  nodes: [
    { id: "research", taskSlug: "wiki-research", kind: "required", capabilityIds: ["research"], weight: 1 },
    { id: "decision", taskSlug: "notes-decision", kind: "required", capabilityIds: ["recovery"], weight: 1 },
    {
      id: "optional-detour",
      taskSlug: "notes-decision",
      kind: "distractor",
      capabilityIds: ["recovery"],
      weight: 1,
      avoidanceEvaluatorName: "optional unrelated thread untouched",
    },
  ],
  edges: [{
    id: "research-to-decision",
    fromNodeId: "research",
    toNodeId: "decision",
    relation: "revises",
    required: true,
    weight: 1,
    proofEvaluatorName: "decision revision verified",
  }],
  faultSchedule: [{
    id: "stale-decision",
    nodeId: "decision",
    kind: "stale-view",
    trigger: { action: "read", occurrence: 2 },
    maxApplications: 1,
    requiredRecovery: true,
    weight: 1,
  }],
};

function session(params: {
  id: string;
  taskSlug: string;
  variantId: string;
  recovered?: boolean;
  normalizedActionCost?: number | null;
  revisionProof?: boolean;
  distractorActed?: boolean;
}) {
  return {
    id: params.id,
    taskSlug: params.taskSlug,
    status: "passed" as const,
    score: 1,
    normalizedActionCost: params.normalizedActionCost,
    evaluators: params.taskSlug === "wiki-research"
      ? [{ type: "retrieve_value", name: "Verified source", status: "passed", score: 1, required: true }]
      : [
          { type: "backend_state", name: "Decision state", status: "passed", score: 1, required: true },
          {
            type: "backend_state",
            name: "decision revision verified",
            status: params.revisionProof === false ? "failed" : "passed",
            score: params.revisionProof === false ? 0 : 1,
            required: false,
          },
          {
            type: "backend_state",
            name: "optional unrelated thread untouched",
            status: params.distractorActed ? "failed" : "passed",
            score: params.distractorActed ? 0 : 1,
            required: false,
          },
        ],
    metadata: {
      questionGeneration: { variantId: params.variantId },
      ...(params.recovered
        ? { scenarioFaultState: { recoveredFaultIds: ["stale-decision"] } }
        : {}),
    },
  };
}

test("builds capability and redacted scenario aggregates from persisted server evidence", () => {
  const result = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions: [
      session({ id: "s1", taskSlug: "wiki-research", variantId: "research-a", normalizedActionCost: 6 }),
      session({ id: "s2", taskSlug: "notes-decision", variantId: "decision-a", recovered: true, normalizedActionCost: 8 }),
    ],
  });

  assert.equal(result?.capabilities.status, "passed");
  assert.equal(result?.capabilities.score, 1);
  assert.equal(result?.scenarioGraph?.status, "passed");
  assert.deepEqual(result?.scenarioGraph?.recoveries, { passed: 1, failed: 0, error: 0 });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("stale-decision"), false);
  assert.equal(serialized.includes("research-to-decision"), false);
});

test("fails closed when revision proof or distractor evidence is missing", () => {
  const missingRevision = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions: [
      session({ id: "s1", taskSlug: "wiki-research", variantId: "research-a", normalizedActionCost: 6 }),
      session({
        id: "s2",
        taskSlug: "notes-decision",
        variantId: "decision-a",
        recovered: true,
        normalizedActionCost: 8,
        revisionProof: false,
      }),
    ],
  });
  assert.equal(missingRevision?.scenarioGraph?.status, "failed");

  const actedOnDistractor = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions: [
      session({ id: "s1", taskSlug: "wiki-research", variantId: "research-a", normalizedActionCost: 6 }),
      session({
        id: "s2",
        taskSlug: "notes-decision",
        variantId: "decision-a",
        recovered: true,
        normalizedActionCost: 8,
        distractorActed: true,
      }),
    ],
  });
  assert.equal(actedOnDistractor?.scenarioGraph?.status, "failed");
});

test("reduces efficiency score without failing a correct attempt", () => {
  const result = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions: [
      session({ id: "s1", taskSlug: "wiki-research", variantId: "research-a", normalizedActionCost: 18 }),
      session({ id: "s2", taskSlug: "notes-decision", variantId: "decision-a", recovered: true, normalizedActionCost: 16 }),
    ],
  });

  assert.equal(result?.capabilities.status, "passed");
  assert.equal(result?.capabilities.score, 0.95);
  assert.equal(
    result?.capabilities.dimensions.find((dimension) => dimension.id === "interaction-cost")?.score,
    0,
  );
});

test("gives no efficiency credit when normalized action evidence is missing", () => {
  const result = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions: [
      session({ id: "s1", taskSlug: "wiki-research", variantId: "research-a" }),
      session({ id: "s2", taskSlug: "notes-decision", variantId: "decision-a", recovered: true }),
    ],
  });

  const interaction = result?.capabilities.dimensions.find(
    (dimension) => dimension.id === "interaction-cost",
  );
  assert.equal(result?.capabilities.status, "passed");
  assert.equal(result?.capabilities.score, 0.95);
  assert.equal(interaction?.score, 0);
  assert.equal(interaction?.componentCount, 0);
});

test("fails closed when required recovery proof is missing", () => {
  const result = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions: [
      session({ id: "s1", taskSlug: "wiki-research", variantId: "research-a" }),
      session({ id: "s2", taskSlug: "notes-decision", variantId: "decision-a" }),
    ],
  });

  assert.equal(result?.capabilities.status, "failed");
  assert.equal(result?.scenarioGraph?.status, "failed");
  assert.equal(result?.capabilities.dimensions.find((dimension) => dimension.id === "recovery-safety")?.score, 0);
});

test("does not credit an unknown selected variant or missing evidence evaluator", () => {
  const sessions = [
    session({ id: "s1", taskSlug: "wiki-research", variantId: "forged-variant" }),
    session({ id: "s2", taskSlug: "notes-decision", variantId: "decision-a", recovered: true }),
  ];
  const result = buildCapabilityAttemptEvaluation({
    attemptMetadata: { capabilityMatrix, scenarioGraph },
    sessions,
  });

  assert.equal(result?.capabilities.status, "failed");
  assert.equal(result?.capabilities.tracks.find((track) => track.id === "research")?.componentCount, 0);
  assert.equal(result?.capabilities.dimensions.find((dimension) => dimension.id === "evidence-verification")?.status, "failed");
});

test("leaves legacy attempts on the existing aggregation path", () => {
  assert.equal(buildCapabilityAttemptEvaluation({ attemptMetadata: {}, sessions: [] }), null);
});

test("rejects forged scenario metadata that omits its capability contract", () => {
  assert.throws(
    () => buildCapabilityAttemptEvaluation({
      attemptMetadata: { scenarioGraph },
      sessions: [],
    }),
    /requires a capability matrix/,
  );
});

test("evaluates the complete hard v1.1.0 campaign from persisted evidence", () => {
  const recoveredByTask: Record<string, string> = {
    "capability-procurement-analysis": "stale-procurement-view",
    "capability-policy-revision-message": "rejected-policy-message",
    "capability-coordinated-schedule": "interrupted-calendar-navigation",
  };
  const sessions = hostedWebCapabilitySuiteMetadata.sessions.map((definition, index) => {
    const variant = definition.metadata.questionVariants[0]!;
    const evaluators = definition.app === "wiki-lite"
      ? [{ type: "retrieve_value", name: "verified source", status: "passed", score: 1, required: true }]
      : definition.app === "sheets-lite"
        ? [{ type: "ui_state", name: "analysis validation was run", status: "passed", score: 1, required: true }]
        : [{ type: "backend_state", name: "required final state", status: "passed", score: 1, required: true }];
    if (definition.app === "inbox-lite") {
      evaluators.push(
        { type: "backend_state", name: "safe approval message sent", status: "passed", score: 1, required: true },
        { type: "backend_state", name: "policy revision observed and applied", status: "passed", score: 1, required: true },
        { type: "backend_state", name: "optional unrelated thread untouched", status: "passed", score: 1, required: false },
      );
    }
    const recoveredFaultId = recoveredByTask[definition.taskSlug];
    return {
      id: `capability-session-${index}`,
      taskSlug: definition.taskSlug,
      status: "passed" as const,
      score: 1,
      normalizedActionCost: 1,
      evaluators,
      metadata: {
        questionGeneration: { variantId: variant.id },
        ...(recoveredFaultId
          ? { scenarioFaultState: { recoveredFaultIds: [recoveredFaultId] } }
          : {}),
      },
    };
  });
  const result = buildCapabilityAttemptEvaluation({
    attemptMetadata: {
      capabilityMatrix: hostedWebCapabilitySuiteMetadata.capabilityMatrix,
      scenarioGraph: hostedWebCapabilitySuiteMetadata.scenarioGraph,
    },
    sessions,
  });

  assert.equal(result?.capabilities.status, "passed");
  assert.equal(result?.capabilities.score, 1);
  assert.equal(result?.capabilities.tracks.length, 6);
  assert.deepEqual(result?.scenarioGraph, {
    status: "passed",
    score: 1,
    nodes: { passed: 8, failed: 0, error: 0 },
    dependencies: { passed: 6, failed: 0, error: 0 },
    recoveries: { passed: 3, failed: 0, error: 0 },
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("stale-procurement-view"), false);
  assert.equal(serialized.includes("policy revision observed and applied"), false);
});
