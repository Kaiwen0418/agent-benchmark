import { z } from "zod";

export const capabilityEvaluationStatusSchema = z.enum(["passed", "failed", "error"]);
export type CapabilityEvaluationStatus = z.infer<typeof capabilityEvaluationStatusSchema>;

export const capabilityScoreDimensionSchema = z.enum([
  "final-state-correctness",
  "dependency-consistency",
  "evidence-verification",
  "recovery-safety",
  "interaction-cost",
]);
export type CapabilityScoreDimension = z.infer<typeof capabilityScoreDimensionSchema>;

export const capabilityScoreComponentSchema = z.object({
  id: z.string().min(1),
  capabilityIds: z.array(z.string().min(1)).min(1),
  dimensionId: capabilityScoreDimensionSchema,
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  weight: z.number().nonnegative().default(1),
  required: z.boolean().default(true),
});
export type CapabilityScoreComponent = z.infer<typeof capabilityScoreComponentSchema>;

const capabilityTrackResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  required: z.boolean(),
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  componentCount: z.number().int().nonnegative(),
});

const capabilityDimensionResultSchema = z.object({
  id: capabilityScoreDimensionSchema,
  weight: z.number().nonnegative(),
  required: z.boolean(),
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  componentCount: z.number().int().nonnegative(),
});

export const capabilityBreakdownSchema = z.object({
  aggregation: z.literal("capability-dimension-weighted"),
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  tracks: z.array(capabilityTrackResultSchema),
  dimensions: z.array(capabilityDimensionResultSchema),
});
export type CapabilityBreakdown = z.infer<typeof capabilityBreakdownSchema>;

type CapabilityDeclaration = { id: string; title: string; required?: boolean };
type DimensionDeclaration = {
  id: CapabilityScoreDimension;
  weight: number;
  required?: boolean;
};

function aggregateComponents(
  components: CapabilityScoreComponent[],
  required: boolean,
): { score: number; status: CapabilityEvaluationStatus; componentCount: number } {
  const requiredComponents = components.filter((component) => component.required !== false);
  const totalWeight = components.reduce((sum, component) => sum + Math.max(component.weight, 0), 0);
  const weightedScore = totalWeight === 0
    ? 0
    : components.reduce(
        (sum, component) => sum + component.score * Math.max(component.weight, 0),
        0,
      ) / totalWeight;
  const hasError = requiredComponents.some((component) => component.status === "error");
  const hasRequiredEvidence = !required || requiredComponents.length > 0;
  const passed = hasRequiredEvidence && requiredComponents.every(
    (component) => component.status === "passed",
  );
  return {
    score: Number(weightedScore.toFixed(4)),
    status: hasError ? "error" : passed ? "passed" : "failed",
    componentCount: components.length,
  };
}

export function aggregateCapabilityScores(params: {
  capabilities: CapabilityDeclaration[];
  dimensions: DimensionDeclaration[];
  components: CapabilityScoreComponent[];
}): CapabilityBreakdown {
  const components = params.components.map((component) => capabilityScoreComponentSchema.parse(component));
  const capabilityIds = params.capabilities.map((capability) => capability.id);
  const dimensionIds = params.dimensions.map((dimension) => dimension.id);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    throw new Error("Capability declarations must have unique ids.");
  }
  if (new Set(dimensionIds).size !== dimensionIds.length) {
    throw new Error("Capability scoring dimensions must have unique ids.");
  }
  if (new Set(components.map((component) => component.id)).size !== components.length) {
    throw new Error("Capability score components must have unique ids.");
  }
  const knownCapabilities = new Set(capabilityIds);
  const knownDimensions = new Set(dimensionIds);
  for (const component of components) {
    if (component.capabilityIds.some((capabilityId) => !knownCapabilities.has(capabilityId))) {
      throw new Error(`Capability component ${component.id} references an undeclared capability.`);
    }
    if (!knownDimensions.has(component.dimensionId)) {
      throw new Error(`Capability component ${component.id} references an undeclared dimension.`);
    }
  }
  const declaredDimensionWeight = params.dimensions.reduce(
    (sum, dimension) => sum + dimension.weight,
    0,
  );
  if (Math.abs(declaredDimensionWeight - 1) > 0.000001) {
    throw new Error("Capability scoring dimension weights must sum to 1.");
  }
  const tracks = params.capabilities.map((capability) => ({
    id: capability.id,
    title: capability.title,
    required: capability.required !== false,
    ...aggregateComponents(
      components.filter((component) => component.capabilityIds.includes(capability.id)),
      capability.required !== false,
    ),
  }));
  const dimensions = params.dimensions.map((dimension) => ({
    id: dimension.id,
    weight: dimension.weight,
    required: dimension.required !== false,
    ...aggregateComponents(
      components.filter((component) => component.dimensionId === dimension.id),
      dimension.required !== false,
    ),
  }));

  const totalWeight = dimensions.reduce((sum, dimension) => sum + Math.max(dimension.weight, 0), 0);
  const weightedScore = totalWeight === 0
    ? 0
    : dimensions.reduce(
        (sum, dimension) => sum + dimension.score * Math.max(dimension.weight, 0),
        0,
      ) / totalWeight;
  const requiredResults = [
    ...tracks.filter((track) => track.required),
    ...dimensions.filter((dimension) => dimension.required),
  ];
  const hasError = requiredResults.some((result) => result.status === "error");
  const passed = requiredResults.every((result) => result.status === "passed");

  return capabilityBreakdownSchema.parse({
    aggregation: "capability-dimension-weighted",
    status: hasError ? "error" : passed ? "passed" : "failed",
    score: Number(weightedScore.toFixed(4)),
    tracks,
    dimensions,
  });
}

// This mirrors the private scenario contract in @agentbench/test-cases without
// importing that package. Scoring receives the already validated service-role
// manifest and never projects these identifiers into browser-visible results.
const scenarioGraphInputSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(z.object({
    id: z.string().min(1),
    taskSlug: z.string().min(1),
    kind: z.enum(["required", "distractor"]),
    capabilityIds: z.array(z.string().min(1)).min(1),
    weight: z.number().nonnegative(),
  })).min(1),
  edges: z.array(z.object({
    id: z.string().min(1),
    fromNodeId: z.string().min(1),
    toNodeId: z.string().min(1),
    relation: z.enum(["requires", "informs", "revises"]),
    required: z.boolean(),
    weight: z.number().nonnegative(),
  })),
  faultSchedule: z.array(z.object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    kind: z.enum(["stale-view", "rejected-mutation", "interrupted-navigation"]),
    trigger: z.object({
      action: z.enum(["read", "mutation", "navigation"]),
      occurrence: z.number().int().positive(),
    }),
    maxApplications: z.literal(1),
    requiredRecovery: z.boolean(),
    weight: z.number().nonnegative(),
  })),
});

export const scenarioNodeOutcomeSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(["passed", "failed", "error", "skipped"]),
  score: z.number().min(0).max(1),
  revisedNodeIds: z.array(z.string()).default([]),
  recoveredFaultIds: z.array(z.string()).default([]),
});
export type ScenarioNodeOutcome = z.infer<typeof scenarioNodeOutcomeSchema>;

const privateScenarioComponentResultSchema = z.object({
  id: z.string(),
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  required: z.boolean(),
  weight: z.number().nonnegative(),
});

export const privateScenarioGraphEvaluationSchema = z.object({
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  nodes: z.array(privateScenarioComponentResultSchema),
  dependencies: z.array(privateScenarioComponentResultSchema),
  recoveries: z.array(privateScenarioComponentResultSchema),
});
export type PrivateScenarioGraphEvaluation = z.infer<typeof privateScenarioGraphEvaluationSchema>;

const statusCountsSchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
});

export const publicScenarioGraphEvaluationSchema = z.object({
  status: capabilityEvaluationStatusSchema,
  score: z.number().min(0).max(1),
  nodes: statusCountsSchema,
  dependencies: statusCountsSchema,
  recoveries: statusCountsSchema,
});
export type PublicScenarioGraphEvaluation = z.infer<typeof publicScenarioGraphEvaluationSchema>;

function componentStatus(outcomes: Array<{ status: CapabilityEvaluationStatus }>) {
  if (outcomes.some((outcome) => outcome.status === "error")) return "error" as const;
  if (outcomes.every((outcome) => outcome.status === "passed")) return "passed" as const;
  return "failed" as const;
}

export function evaluateScenarioGraph(params: {
  graph: unknown;
  outcomes: ScenarioNodeOutcome[];
}): PrivateScenarioGraphEvaluation {
  const graph = scenarioGraphInputSchema.parse(params.graph);
  const outcomes = params.outcomes.map((outcome) => scenarioNodeOutcomeSchema.parse(outcome));
  const knownNodeIds = new Set(graph.nodes.map((node) => node.id));
  if (new Set(outcomes.map((outcome) => outcome.nodeId)).size !== outcomes.length) {
    throw new Error("Scenario outcomes must contain at most one result per graph node.");
  }
  if (outcomes.some((outcome) => !knownNodeIds.has(outcome.nodeId))) {
    throw new Error("Scenario outcomes must not reference nodes outside the private graph.");
  }
  const outcomeByNode = new Map(outcomes.map((outcome) => [outcome.nodeId, outcome]));

  const nodes = graph.nodes.map((node) => {
    const outcome = outcomeByNode.get(node.id);
    if (node.kind === "distractor") {
      const ignored = !outcome || outcome.status === "skipped";
      return {
        id: node.id,
        status: ignored ? ("passed" as const) : ("failed" as const),
        score: ignored ? 1 : 0,
        required: true,
        weight: node.weight,
      };
    }
    return {
      id: node.id,
      status: outcome?.status === "error"
        ? ("error" as const)
        : outcome?.status === "passed"
          ? ("passed" as const)
          : ("failed" as const),
      score: outcome?.status === "passed" ? outcome.score : 0,
      required: true,
      weight: node.weight,
    };
  });

  const nodeResultById = new Map(nodes.map((node) => [node.id, node]));
  const dependencies = graph.edges.map((edge) => {
    const source = nodeResultById.get(edge.fromNodeId);
    const target = nodeResultById.get(edge.toNodeId);
    const targetOutcome = outcomeByNode.get(edge.toNodeId);
    const endpointsPassed = source?.status === "passed" && target?.status === "passed";
    const revisionRecorded = edge.relation !== "revises"
      || targetOutcome?.revisedNodeIds.includes(edge.fromNodeId) === true;
    const passed = endpointsPassed && revisionRecorded;
    const hasError = source?.status === "error" || target?.status === "error";
    return {
      id: edge.id,
      status: hasError ? ("error" as const) : passed ? ("passed" as const) : ("failed" as const),
      score: passed ? 1 : 0,
      required: edge.required,
      weight: edge.weight,
    };
  });

  const recoveries = graph.faultSchedule.map((fault) => {
    const outcome = outcomeByNode.get(fault.nodeId);
    const recovered = outcome?.recoveredFaultIds.includes(fault.id) === true;
    return {
      id: fault.id,
      status: outcome?.status === "error"
        ? ("error" as const)
        : recovered
          ? ("passed" as const)
          : ("failed" as const),
      score: recovered ? 1 : 0,
      required: fault.requiredRecovery,
      weight: fault.weight,
    };
  });

  const components = [...nodes, ...dependencies, ...recoveries];
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const score = totalWeight === 0
    ? 0
    : components.reduce((sum, component) => sum + component.score * component.weight, 0) / totalWeight;
  const required = components.filter((component) => component.required);
  return privateScenarioGraphEvaluationSchema.parse({
    status: componentStatus(required),
    score: Number(score.toFixed(4)),
    nodes,
    dependencies,
    recoveries,
  });
}

function countStatuses(components: Array<{ status: CapabilityEvaluationStatus }>) {
  return {
    passed: components.filter((component) => component.status === "passed").length,
    failed: components.filter((component) => component.status === "failed").length,
    error: components.filter((component) => component.status === "error").length,
  };
}

export function projectScenarioGraphEvaluation(
  result: PrivateScenarioGraphEvaluation,
): PublicScenarioGraphEvaluation {
  return publicScenarioGraphEvaluationSchema.parse({
    status: result.status,
    score: result.score,
    nodes: countStatuses(result.nodes),
    dependencies: countStatuses(result.dependencies),
    recoveries: countStatuses(result.recoveries),
  });
}
