import { z } from "zod";
import { hostedSessionDefinitionSchema } from "./generated-app-registry.js";
import {
  capabilityMatrixSchema,
  privateScenarioGraphSchema,
} from "./capability-benchmark.js";

export { hostedSessionDefinitionSchema, parseQuestionVariants } from "./generated-app-registry.js";

// Cross-app consistency declaration. Mirrors `suiteConsistencyCheckSchema` in
// @agentbench/scoring (the canonical owner of the evaluation semantics); kept
// local so this package stays zod-only. The orchestrator re-parses the manifest
// with scoring's schema before evaluating, so any drift is caught there.
export const hostedSuiteConsistencyCheckSchema = z.object({
  name: z.string().min(1),
  sourceTaskSlug: z.string().min(1),
  sourcePath: z.string().min(1),
  targetTaskSlug: z.string().min(1),
  targetPath: z.string().min(1),
  rule: z.enum([
    "equal-normalized",
    "target-contains-source",
    "target-digest-matches-source",
  ]).default("equal-normalized"),
  weight: z.number().nonnegative().default(1),
  required: z.boolean().default(true),
});

export type HostedSuiteConsistencyCheck = z.infer<typeof hostedSuiteConsistencyCheckSchema>;

export const hostedSuiteMetadataSchema = z.object({
  suiteSlug: z.string().min(1),
  suiteVersion: z.string().min(1),
  timeLimitMinutesPerTestcase: z.number().int().positive().optional(),
  sessions: z.array(hostedSessionDefinitionSchema).min(1),
  // Optional so suites without a chain (the easy suite) parse to byte-identical
  // manifests — the key is simply absent rather than defaulted in.
  consistencyChecks: z.array(hostedSuiteConsistencyCheckSchema).optional(),
  // Service-role-only contracts for capability-oriented releases. They remain
  // absent from legacy manifests so published content hashes stay immutable.
  capabilityMatrix: capabilityMatrixSchema.optional(),
  scenarioGraph: privateScenarioGraphSchema.optional(),
}).superRefine((suite, context) => {
  const indexes = suite.sessions.map((session) => session.sequenceIndex);
  if (new Set(indexes).size !== indexes.length || indexes.some((value, index) => value !== index)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hosted suite sequence indexes must be unique and contiguous from zero.",
      path: ["sessions"],
    });
  }
  for (const [index, session] of suite.sessions.entries()) {
    const ids = session.metadata.questionVariants.map((variant) => variant.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Question variant ids must be unique for ${session.app}.`,
        path: ["sessions", index, "metadata", "questionVariants"],
      });
    }
  }
  // A consistency check must reference real sessions, and the source session
  // must run before the target so the agent can actually carry the value.
  const sequenceByTaskSlug = new Map(suite.sessions.map((session) => [session.taskSlug, session.sequenceIndex]));
  for (const [index, check] of (suite.consistencyChecks ?? []).entries()) {
    const sourceSequence = sequenceByTaskSlug.get(check.sourceTaskSlug);
    const targetSequence = sequenceByTaskSlug.get(check.targetTaskSlug);
    if (sourceSequence === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Consistency check "${check.name}" references unknown source session ${check.sourceTaskSlug}.`,
        path: ["consistencyChecks", index, "sourceTaskSlug"],
      });
    }
    if (targetSequence === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Consistency check "${check.name}" references unknown target session ${check.targetTaskSlug}.`,
        path: ["consistencyChecks", index, "targetTaskSlug"],
      });
    }
    if (
      sourceSequence !== undefined &&
      targetSequence !== undefined &&
      sourceSequence >= targetSequence
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Consistency check "${check.name}" requires its source session to run before its target session.`,
        path: ["consistencyChecks", index],
      });
    }
  }

  const sessionByTaskSlug = new Map(suite.sessions.map((session) => [session.taskSlug, session]));
  const knownCapabilities = new Set(
    suite.capabilityMatrix?.capabilities.map((capability) => capability.id) ?? [],
  );
  for (const [index, entry] of (suite.capabilityMatrix?.coverage ?? []).entries()) {
    const session = sessionByTaskSlug.get(entry.taskSlug);
    if (!session) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability coverage references unknown session ${entry.taskSlug}.`,
        path: ["capabilityMatrix", "coverage", index, "taskSlug"],
      });
      continue;
    }
    if (!session.metadata.questionVariants.some((variant) => variant.id === entry.variantId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability coverage references unknown variant ${entry.variantId} for ${entry.taskSlug}.`,
        path: ["capabilityMatrix", "coverage", index, "variantId"],
      });
    }
  }
  if (suite.scenarioGraph && !suite.capabilityMatrix) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A scenario graph requires a capability matrix.",
      path: ["capabilityMatrix"],
    });
  }
  for (const [index, node] of (suite.scenarioGraph?.nodes ?? []).entries()) {
    if (!sessionByTaskSlug.has(node.taskSlug)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scenario node ${node.id} references unknown session ${node.taskSlug}.`,
        path: ["scenarioGraph", "nodes", index, "taskSlug"],
      });
    }
    for (const capabilityId of node.capabilityIds) {
      if (!knownCapabilities.has(capabilityId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Scenario node ${node.id} references unknown capability ${capabilityId}.`,
          path: ["scenarioGraph", "nodes", index, "capabilityIds"],
        });
      }
    }
  }
});

export type HostedSessionDefinition = z.infer<typeof hostedSessionDefinitionSchema>;
export type HostedSuiteMetadata = z.infer<typeof hostedSuiteMetadataSchema>;
export type HostedQuestionVariant = HostedSessionDefinition["metadata"]["questionVariants"][number];
