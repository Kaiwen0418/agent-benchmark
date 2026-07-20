import {
  capabilityMatrixSchema,
  privateScenarioGraphSchema,
  type CapabilityCoverageEntry,
  type CapabilityMatrix,
  type PrivateScenarioGraph,
} from "@agentbench/test-cases";
import {
  aggregateCapabilityScores,
  evaluateScenarioGraph,
  hostedWebEvaluatorResultSchema,
  projectScenarioGraphEvaluation,
  type CapabilityBreakdown,
  type CapabilityEvaluationStatus,
  type CapabilityScoreComponent,
  type HostedWebEvaluatorResult,
  type PublicScenarioGraphEvaluation,
  type ScenarioNodeOutcome,
} from "@agentbench/scoring";

export type CapabilityAttemptSession = {
  id: string;
  taskSlug: string;
  metadata: unknown;
  status: "passed" | "failed" | "error";
  score: number;
  evaluators: unknown;
  normalizedActionCost?: number | null;
};

export type CapabilityAttemptEvaluation = {
  capabilities: CapabilityBreakdown;
  scenarioGraph?: PublicScenarioGraphEvaluation;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function selectedVariantId(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.questionGeneration)) return null;
  return typeof metadata.questionGeneration.variantId === "string"
    ? metadata.questionGeneration.variantId
    : null;
}

function recoveredFaultIds(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.scenarioFaultState)) return [];
  return readStringArray(metadata.scenarioFaultState.recoveredFaultIds);
}

function parsedEvaluators(value: unknown): HostedWebEvaluatorResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const parsed = hostedWebEvaluatorResultSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

function evidenceComponent(
  session: CapabilityAttemptSession,
  coverage: CapabilityCoverageEntry,
): CapabilityScoreComponent | null {
  const evaluators = parsedEvaluators(session.evaluators).filter(
    (evaluator) => evaluator.required !== false
      && (evaluator.type === "retrieve_value" || evaluator.type === "ui_state"),
  );
  if (evaluators.length === 0) return null;

  const status: CapabilityEvaluationStatus = evaluators.some((evaluator) => evaluator.status === "error")
    ? "error"
    : evaluators.every((evaluator) => evaluator.status === "passed")
      ? "passed"
      : "failed";
  const score = evaluators.reduce((sum, evaluator) => sum + evaluator.score, 0) / evaluators.length;
  return {
    id: `evidence:${session.id}`,
    capabilityIds: coverage.capabilityIds,
    dimensionId: "evidence-verification",
    status,
    score: Number(score.toFixed(4)),
    weight: 1,
    required: true,
  };
}

function interactionCostComponent(
  session: CapabilityAttemptSession,
  coverage: CapabilityCoverageEntry,
): CapabilityScoreComponent | null {
  const cost = session.normalizedActionCost;
  const budget = coverage.interactionBudget;
  if (!coverage.dimensionIds.includes("interaction-cost")
    || !budget
    || typeof cost !== "number"
    || !Number.isFinite(cost)
    || cost < 0) {
    return null;
  }

  const score = cost <= budget.preferredMaxActions
    ? 1
    : cost >= budget.hardMaxActions
      ? 0
      : (budget.hardMaxActions - cost)
        / (budget.hardMaxActions - budget.preferredMaxActions);
  return {
    id: `interaction-cost:${session.id}`,
    capabilityIds: coverage.capabilityIds,
    dimensionId: "interaction-cost",
    status: "passed",
    score: Number(score.toFixed(4)),
    weight: 1,
    required: false,
  };
}

function matchingCoverage(matrix: CapabilityMatrix, session: CapabilityAttemptSession) {
  const variantId = selectedVariantId(session.metadata);
  if (!variantId) return null;
  return matrix.coverage.find(
    (entry) => entry.taskSlug === session.taskSlug && entry.variantId === variantId,
  ) ?? null;
}

function buildSessionComponents(
  matrix: CapabilityMatrix,
  sessions: CapabilityAttemptSession[],
) {
  const components: CapabilityScoreComponent[] = [];
  for (const session of sessions) {
    const coverage = matchingCoverage(matrix, session);
    if (!coverage) continue;

    if (coverage.dimensionIds.includes("final-state-correctness")) {
      components.push({
        id: `final-state:${session.id}`,
        capabilityIds: coverage.capabilityIds,
        dimensionId: "final-state-correctness",
        status: session.status,
        score: session.status === "passed" ? session.score : 0,
        weight: 1,
        required: true,
      });
    }
    if (coverage.dimensionIds.includes("evidence-verification")) {
      const evidence = evidenceComponent(session, coverage);
      if (evidence) components.push(evidence);
    }
    const interactionCost = interactionCostComponent(session, coverage);
    if (interactionCost) components.push(interactionCost);
  }
  return components;
}

function buildScenarioOutcomes(
  graph: PrivateScenarioGraph,
  sessions: CapabilityAttemptSession[],
): ScenarioNodeOutcome[] {
  const sessionByTaskSlug = new Map(sessions.map((session) => [session.taskSlug, session]));
  return graph.nodes.flatMap((node) => {
    const session = sessionByTaskSlug.get(node.taskSlug);
    if (!session) return [];
    const evaluators = parsedEvaluators(session.evaluators);
    if (node.kind === "distractor") {
      const avoidanceEvidence = evaluators.find(
        (evaluator) => evaluator.name === node.avoidanceEvaluatorName,
      );
      if (avoidanceEvidence?.status === "passed") return [];
      return [{
        nodeId: node.id,
        status: avoidanceEvidence?.status === "error" ? "error" : "failed",
        score: 0,
        revisedNodeIds: [],
        recoveredFaultIds: [],
      } satisfies ScenarioNodeOutcome];
    }
    const revisedNodeIds = graph.edges.flatMap((edge) =>
      edge.relation === "revises"
        && edge.toNodeId === node.id
        && evaluators.some(
          (evaluator) => evaluator.name === edge.proofEvaluatorName && evaluator.status === "passed",
        )
        ? [edge.fromNodeId]
        : [],
    );
    return [{
      nodeId: node.id,
      status: session.status,
      score: session.status === "passed" ? session.score : 0,
      revisedNodeIds,
      recoveredFaultIds: recoveredFaultIds(session.metadata),
    } satisfies ScenarioNodeOutcome];
  });
}

function buildGraphComponents(params: {
  matrix: CapabilityMatrix;
  graph: PrivateScenarioGraph;
  sessions: CapabilityAttemptSession[];
  evaluated: ReturnType<typeof evaluateScenarioGraph>;
}) {
  const components: CapabilityScoreComponent[] = [];
  const selectedCoverageByTask = new Map(
    params.sessions.flatMap((session) => {
      const coverage = matchingCoverage(params.matrix, session);
      return coverage ? [[session.taskSlug, coverage] as const] : [];
    }),
  );
  const nodeById = new Map(params.graph.nodes.map((node) => [node.id, node]));
  const dependencyResultById = new Map(params.evaluated.dependencies.map((result) => [result.id, result]));
  for (const edge of params.graph.edges) {
    const targetNode = nodeById.get(edge.toNodeId);
    const coverage = targetNode ? selectedCoverageByTask.get(targetNode.taskSlug) : null;
    const result = dependencyResultById.get(edge.id);
    if (!targetNode || !coverage?.dimensionIds.includes("dependency-consistency") || !result) continue;
    components.push({
      id: `dependency:${edge.id}`,
      capabilityIds: targetNode.capabilityIds,
      dimensionId: "dependency-consistency",
      status: result.status,
      score: result.score,
      weight: result.weight,
      required: result.required,
    });
  }

  const recoveryResultById = new Map(params.evaluated.recoveries.map((result) => [result.id, result]));
  for (const fault of params.graph.faultSchedule) {
    const node = nodeById.get(fault.nodeId);
    const coverage = node ? selectedCoverageByTask.get(node.taskSlug) : null;
    const result = recoveryResultById.get(fault.id);
    if (!node || !coverage?.dimensionIds.includes("recovery-safety") || !result) continue;
    components.push({
      id: `recovery:${fault.id}`,
      capabilityIds: node.capabilityIds,
      dimensionId: "recovery-safety",
      status: result.status,
      score: result.score,
      weight: result.weight,
      required: result.required,
    });
  }
  return components;
}

export function buildCapabilityAttemptEvaluation(params: {
  attemptMetadata: Record<string, unknown>;
  sessions: CapabilityAttemptSession[];
}): CapabilityAttemptEvaluation | null {
  if (params.attemptMetadata.capabilityMatrix === undefined) {
    if (params.attemptMetadata.scenarioGraph !== undefined) {
      throw new Error("Scenario graph metadata requires a capability matrix.");
    }
    return null;
  }

  const matrix = capabilityMatrixSchema.parse(params.attemptMetadata.capabilityMatrix);
  const graph = params.attemptMetadata.scenarioGraph === undefined
    ? undefined
    : privateScenarioGraphSchema.parse(params.attemptMetadata.scenarioGraph);
  const components = buildSessionComponents(matrix, params.sessions);
  let scenarioGraph: PublicScenarioGraphEvaluation | undefined;
  if (graph) {
    const evaluated = evaluateScenarioGraph({
      graph,
      outcomes: buildScenarioOutcomes(graph, params.sessions),
    });
    components.push(...buildGraphComponents({ matrix, graph, sessions: params.sessions, evaluated }));
    scenarioGraph = projectScenarioGraphEvaluation(evaluated);
  }

  return {
    capabilities: aggregateCapabilityScores({
      capabilities: matrix.capabilities,
      dimensions: matrix.dimensions,
      components,
    }),
    ...(scenarioGraph ? { scenarioGraph } : {}),
  };
}
