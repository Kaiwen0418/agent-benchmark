import { z } from "zod";

export const capabilityScoreDimensionSchema = z.enum([
  "final-state-correctness",
  "dependency-consistency",
  "evidence-verification",
  "recovery-safety",
  "interaction-cost",
]);

export type CapabilityScoreDimension = z.infer<typeof capabilityScoreDimensionSchema>;

export const capabilityTrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  required: z.boolean().default(true),
});

export type CapabilityTrack = z.infer<typeof capabilityTrackSchema>;

export const capabilityDimensionSchema = z.object({
  id: capabilityScoreDimensionSchema,
  weight: z.number().positive().max(1),
  required: z.boolean().default(true),
});

export type CapabilityDimension = z.infer<typeof capabilityDimensionSchema>;

export const capabilityCoverageEntrySchema = z.object({
  taskSlug: z.string().min(1),
  variantId: z.string().min(1),
  capabilityIds: z.array(z.string().min(1)).min(1),
  dimensionIds: z.array(capabilityScoreDimensionSchema).min(1),
  interactionBudget: z.object({
    preferredMaxActions: z.number().int().positive(),
    hardMaxActions: z.number().int().positive(),
  }).refine(
    (budget) => budget.hardMaxActions > budget.preferredMaxActions,
    "Hard action budget must exceed the preferred action budget.",
  ).optional(),
});

export type CapabilityCoverageEntry = z.infer<typeof capabilityCoverageEntrySchema>;

export const capabilityMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  capabilities: z.array(capabilityTrackSchema).min(1),
  dimensions: z.array(capabilityDimensionSchema).min(1),
  coverage: z.array(capabilityCoverageEntrySchema).min(1),
}).superRefine((matrix, context) => {
  const capabilityIds = matrix.capabilities.map((capability) => capability.id);
  const dimensionIds = matrix.dimensions.map((dimension) => dimension.id);
  const coverageKeys = matrix.coverage.map((entry) => `${entry.taskSlug}:${entry.variantId}`);

  for (const [path, values] of [
    ["capabilities", capabilityIds],
    ["dimensions", dimensionIds],
    ["coverage", coverageKeys],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${path} entries must be unique.`,
        path: [path],
      });
    }
  }

  const totalWeight = matrix.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.000001) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Capability dimension weights must sum to 1.",
      path: ["dimensions"],
    });
  }

  const knownCapabilities = new Set(capabilityIds);
  const knownDimensions = new Set(dimensionIds);
  for (const [index, entry] of matrix.coverage.entries()) {
    for (const capabilityId of entry.capabilityIds) {
      if (!knownCapabilities.has(capabilityId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage references unknown capability ${capabilityId}.`,
          path: ["coverage", index, "capabilityIds"],
        });
      }
    }
    for (const dimensionId of entry.dimensionIds) {
      if (!knownDimensions.has(dimensionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage references undeclared dimension ${dimensionId}.`,
          path: ["coverage", index, "dimensionIds"],
        });
      }
    }
    const measuresInteractionCost = entry.dimensionIds.includes("interaction-cost");
    if (measuresInteractionCost !== Boolean(entry.interactionBudget)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: measuresInteractionCost
          ? "Interaction-cost coverage requires an action budget."
          : "Action budgets are allowed only for interaction-cost coverage.",
        path: ["coverage", index, "interactionBudget"],
      });
    }
  }

  const interactionDimension = matrix.dimensions.find((dimension) => dimension.id === "interaction-cost");
  if (interactionDimension && interactionDimension.required !== false) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Interaction cost must remain a non-gating scoring dimension.",
      path: ["dimensions", dimensionIds.indexOf("interaction-cost"), "required"],
    });
  }

  // A declared track or scoring dimension backed by a single variant is too
  // easy to memorize and cannot demonstrate presentation-independent coverage.
  for (const capabilityId of capabilityIds) {
    const variants = matrix.coverage.filter((entry) => entry.capabilityIds.includes(capabilityId));
    if (variants.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability ${capabilityId} must be covered by at least two independent variants.`,
        path: ["coverage"],
      });
    }
  }
  for (const dimensionId of dimensionIds) {
    const variants = matrix.coverage.filter((entry) => entry.dimensionIds.includes(dimensionId));
    if (variants.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scoring dimension ${dimensionId} must be covered by at least two independent variants.`,
        path: ["coverage"],
      });
    }
  }
});

export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;

export const scenarioNodeSchema = z.object({
  id: z.string().min(1),
  taskSlug: z.string().min(1),
  kind: z.enum(["required", "distractor"]).default("required"),
  capabilityIds: z.array(z.string().min(1)).min(1),
  weight: z.number().nonnegative().default(1),
  avoidanceEvaluatorName: z.string().min(1).optional(),
}).superRefine((node, context) => {
  if (node.kind === "distractor" && !node.avoidanceEvaluatorName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Distractor nodes require a server-owned avoidance evaluator.",
      path: ["avoidanceEvaluatorName"],
    });
  }
  if (node.kind !== "distractor" && node.avoidanceEvaluatorName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Avoidance evaluators are allowed only on distractor nodes.",
      path: ["avoidanceEvaluatorName"],
    });
  }
});

export type ScenarioNode = z.infer<typeof scenarioNodeSchema>;

export const scenarioEdgeSchema = z.object({
  id: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  relation: z.enum(["requires", "informs", "revises"]),
  required: z.boolean().default(true),
  weight: z.number().nonnegative().default(1),
  proofEvaluatorName: z.string().min(1).optional(),
}).superRefine((edge, context) => {
  if (edge.relation === "revises" && !edge.proofEvaluatorName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Revision edges require a server-owned proof evaluator.",
      path: ["proofEvaluatorName"],
    });
  }
  if (edge.relation !== "revises" && edge.proofEvaluatorName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Proof evaluators are allowed only on revision edges.",
      path: ["proofEvaluatorName"],
    });
  }
});

export type ScenarioEdge = z.infer<typeof scenarioEdgeSchema>;

export const deterministicFaultSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  kind: z.enum(["stale-view", "rejected-mutation", "interrupted-navigation"]),
  trigger: z.object({
    action: z.enum(["read", "mutation", "navigation"]),
    occurrence: z.number().int().positive(),
  }),
  maxApplications: z.literal(1).default(1),
  requiredRecovery: z.boolean().default(true),
  weight: z.number().nonnegative().default(1),
});

export type DeterministicFault = z.infer<typeof deterministicFaultSchema>;

export const privateScenarioGraphSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(scenarioNodeSchema).min(1),
  edges: z.array(scenarioEdgeSchema),
  faultSchedule: z.array(deterministicFaultSchema).default([]),
}).superRefine((graph, context) => {
  const nodeIds = graph.nodes.map((node) => node.id);
  const edgeIds = graph.edges.map((edge) => edge.id);
  const faultIds = graph.faultSchedule.map((fault) => fault.id);
  for (const [path, values] of [
    ["nodes", nodeIds],
    ["edges", edgeIds],
    ["faultSchedule", faultIds],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${path} ids must be unique.`,
        path: [path],
      });
    }
  }

  const knownNodes = new Set(nodeIds);
  for (const [index, edge] of graph.edges.entries()) {
    if (!knownNodes.has(edge.fromNodeId) || !knownNodes.has(edge.toNodeId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scenario edge ${edge.id} references an unknown node.`,
        path: ["edges", index],
      });
    }
    if (edge.fromNodeId === edge.toNodeId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scenario edge ${edge.id} cannot point to the same node.`,
        path: ["edges", index],
      });
    }
  }
  for (const [index, fault] of graph.faultSchedule.entries()) {
    if (!knownNodes.has(fault.nodeId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Fault ${fault.id} references unknown node ${fault.nodeId}.`,
        path: ["faultSchedule", index, "nodeId"],
      });
    }
  }

  const taskSlugByNodeId = new Map(graph.nodes.map((node) => [node.id, node.taskSlug]));
  const requestTriggerKeys = graph.faultSchedule.map((fault) => {
    const requestClass = fault.trigger.action === "mutation" ? "mutation" : "read-navigation";
    return `${taskSlugByNodeId.get(fault.nodeId) ?? fault.nodeId}:${requestClass}:${fault.trigger.occurrence}`;
  });
  if (new Set(requestTriggerKeys).size !== requestTriggerKeys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fault triggers for the same task and request occurrence must be unique.",
      path: ["faultSchedule"],
    });
  }

  // Scenario graphs are dependency DAGs. Revisions point from the original
  // work to its replacement and therefore do not require a cycle.
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const targets = outgoing.get(edge.fromNodeId) ?? [];
    targets.push(edge.toNodeId);
    outgoing.set(edge.fromNodeId, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (hasCycle(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  if (nodeIds.some((nodeId) => hasCycle(nodeId))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Scenario graph dependencies must be acyclic.",
      path: ["edges"],
    });
  }
});

export type PrivateScenarioGraph = z.infer<typeof privateScenarioGraphSchema>;
