import { z } from "zod";

export const hostedWebEvaluatorTypeSchema = z.enum([
  "retrieve_value",
  "backend_state",
  "ui_state",
  "final_response",
]);

export type HostedWebEvaluatorType = z.infer<typeof hostedWebEvaluatorTypeSchema>;

export const hostedWebEvaluatorStatusSchema = z.enum(["passed", "failed", "error"]);

export type HostedWebEvaluatorStatus = z.infer<typeof hostedWebEvaluatorStatusSchema>;

export const hostedWebEvaluatorResultSchema = z.object({
  type: hostedWebEvaluatorTypeSchema,
  name: z.string(),
  score: z.number().min(0).max(1),
  status: hostedWebEvaluatorStatusSchema,
  required: z.boolean().default(true),
  evidence: z.record(z.any()).optional(),
  errorMessage: z.string().optional(),
});

export type HostedWebEvaluatorResult = z.infer<typeof hostedWebEvaluatorResultSchema>;

export const hostedWebScoreResultSchema = z.object({
  score: z.number().min(0).max(1),
  status: hostedWebEvaluatorStatusSchema,
  summary: z.string(),
  evaluators: z.array(hostedWebEvaluatorResultSchema),
});

export type HostedWebScoreResult = z.infer<typeof hostedWebScoreResultSchema>;

export const hostedWebSuiteSessionScoreSchema = z.object({
  sessionId: z.string(),
  app: z.string(),
  taskSlug: z.string(),
  status: hostedWebEvaluatorStatusSchema,
  score: z.number().min(0).max(1),
  weight: z.number().nonnegative().default(1),
  required: z.boolean().default(true),
});

export type HostedWebSuiteSessionScore = z.infer<typeof hostedWebSuiteSessionScoreSchema>;

// Cross-app consistency: a suite-level check that the agent carried the same
// output value across two sessions. Comparisons are made against the agents'
// own session final states (never private task config), so no hidden answer key
// is involved — only "did the value the agent produced in session A reappear in
// session B".
export const suiteConsistencyRuleSchema = z.enum(["equal-normalized", "target-contains-source"]);

export type SuiteConsistencyRule = z.infer<typeof suiteConsistencyRuleSchema>;

export const suiteConsistencyCheckSchema = z.object({
  name: z.string().min(1),
  sourceTaskSlug: z.string().min(1),
  sourcePath: z.string().min(1),
  targetTaskSlug: z.string().min(1),
  targetPath: z.string().min(1),
  rule: suiteConsistencyRuleSchema.default("equal-normalized"),
  weight: z.number().nonnegative().default(1),
  required: z.boolean().default(true),
});

export type SuiteConsistencyCheck = z.infer<typeof suiteConsistencyCheckSchema>;

export const suiteConsistencyResultSchema = z.object({
  name: z.string(),
  rule: suiteConsistencyRuleSchema,
  status: z.enum(["passed", "failed"]),
  score: z.number().min(0).max(1),
  weight: z.number().nonnegative().default(1),
  required: z.boolean().default(true),
  sourceTaskSlug: z.string(),
  targetTaskSlug: z.string(),
  // Evidence identifies which prior-session outputs were consulted without
  // leaking private config or the full corpus: only the dotted paths, presence
  // flags, and the matched agent-produced value (the agent already authored it).
  evidence: z.record(z.any()).optional(),
  errorMessage: z.string().optional(),
});

export type SuiteConsistencyResult = z.infer<typeof suiteConsistencyResultSchema>;

export const hostedWebSuiteScoreResultSchema = z.object({
  score: z.number().min(0).max(1),
  status: hostedWebEvaluatorStatusSchema,
  summary: z.string(),
  breakdown: z.object({
    aggregation: z.literal("weighted-required-suite"),
    sessions: z.array(hostedWebSuiteSessionScoreSchema),
    consistency: z.array(suiteConsistencyResultSchema).optional(),
  }),
});

export type HostedWebSuiteScoreResult = z.infer<typeof hostedWebSuiteScoreResultSchema>;

export function aggregateStrictScore(params: {
  evaluators: HostedWebEvaluatorResult[];
  passSummary: string;
  failSummary: string;
}): HostedWebScoreResult {
  const required = params.evaluators.filter((evaluator) => evaluator.required !== false);
  const hasError = required.some((evaluator) => evaluator.status === "error");
  const passed = required.length > 0 && required.every((evaluator) => evaluator.status === "passed");

  return {
    score: passed ? 1 : 0,
    status: hasError ? "error" : passed ? "passed" : "failed",
    summary: passed ? params.passSummary : params.failSummary,
    evaluators: params.evaluators,
  };
}

export function passedEvaluator(params: {
  type: HostedWebEvaluatorType;
  name: string;
  evidence?: Record<string, unknown>;
  required?: boolean;
}): HostedWebEvaluatorResult {
  return {
    type: params.type,
    name: params.name,
    score: 1,
    status: "passed",
    required: params.required ?? true,
    evidence: params.evidence,
  };
}

export function failedEvaluator(params: {
  type: HostedWebEvaluatorType;
  name: string;
  errorMessage: string;
  evidence?: Record<string, unknown>;
  required?: boolean;
}): HostedWebEvaluatorResult {
  return {
    type: params.type,
    name: params.name,
    score: 0,
    status: "failed",
    required: params.required ?? true,
    evidence: params.evidence,
    errorMessage: params.errorMessage,
  };
}

export function aggregateSuiteScore(params: {
  sessions: HostedWebSuiteSessionScore[];
  consistency?: SuiteConsistencyResult[];
  passSummary?: string;
  failSummary?: string;
}): HostedWebSuiteScoreResult {
  const sessions = params.sessions;
  const consistency = params.consistency ?? [];
  const required = sessions.filter((session) => session.required !== false);
  const requiredStatus = required.map((session) => session.status);
  const hasError = requiredStatus.some((status) => status === "error");
  const requiredSessionsPassed = required.every((session) => session.status === "passed");
  const requiredConsistencyPassed = consistency
    .filter((check) => check.required !== false)
    .every((check) => check.status === "passed");
  const requiredPassed = requiredSessionsPassed && requiredConsistencyPassed;

  // Consistency checks are first-class weighted-required components alongside
  // sessions, so a broken cross-app chain lowers the score and fails the suite.
  const sessionWeight = sessions.reduce((sum, session) => sum + Math.max(session.weight, 0), 0);
  const consistencyWeight = consistency.reduce((sum, check) => sum + Math.max(check.weight, 0), 0);
  const totalWeight = sessionWeight + consistencyWeight;
  const weightedSum =
    sessions.reduce((sum, session) => sum + session.score * Math.max(session.weight, 0), 0) +
    consistency.reduce((sum, check) => sum + check.score * Math.max(check.weight, 0), 0);
  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const normalizedScore = Number(weightedScore.toFixed(4));
  const status = hasError ? "error" : requiredPassed ? "passed" : "failed";

  return {
    score: normalizedScore,
    status,
    summary:
      status === "passed"
        ? params.passSummary ?? "All required hosted-web sessions passed."
        : params.failSummary ?? "One or more required hosted-web sessions failed.",
    breakdown: {
      aggregation: "weighted-required-suite",
      sessions,
      ...(consistency.length > 0 ? { consistency } : {}),
    },
  };
}

function normalizeConsistencyValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Resolve a dotted path against a session final state, returning every string
// value reachable. A `[]` segment fans out across array elements, so a path
// like `notes[].title` yields the title of every note. Non-string leaves are
// coerced with String() so numeric outputs (totals, durations) still compare.
function resolveConsistencyValues(root: unknown, path: string): string[] {
  const segments = path.split(".").filter((segment) => segment.length > 0);
  let current: unknown[] = [root];
  for (const rawSegment of segments) {
    const wildcard = rawSegment.endsWith("[]");
    const key = wildcard ? rawSegment.slice(0, -2) : rawSegment;
    const next: unknown[] = [];
    for (const node of current) {
      if (node === null || node === undefined || typeof node !== "object") {
        continue;
      }
      const child = (node as Record<string, unknown>)[key];
      if (wildcard) {
        if (Array.isArray(child)) {
          next.push(...child);
        }
      } else {
        next.push(child);
      }
    }
    current = next;
  }
  return current
    .filter((value) => value !== null && value !== undefined && typeof value !== "object")
    .map((value) => String(value))
    .filter((value) => value.length > 0);
}

// Evaluate cross-app consistency checks against a map of taskSlug -> session
// final state. Deterministic and pure: a missing session, missing path, or
// rule mismatch all resolve to a failed check ("missing prior output").
export function evaluateSuiteConsistency(
  checks: SuiteConsistencyCheck[],
  finalStateByTaskSlug: Map<string, unknown>,
): SuiteConsistencyResult[] {
  return checks.map((check) => {
    const base = {
      name: check.name,
      rule: check.rule,
      weight: check.weight,
      required: check.required,
      sourceTaskSlug: check.sourceTaskSlug,
      targetTaskSlug: check.targetTaskSlug,
    };

    const hasSource = finalStateByTaskSlug.has(check.sourceTaskSlug);
    const hasTarget = finalStateByTaskSlug.has(check.targetTaskSlug);
    const sourceValues = hasSource
      ? resolveConsistencyValues(finalStateByTaskSlug.get(check.sourceTaskSlug), check.sourcePath)
      : [];
    const targetValues = hasTarget
      ? resolveConsistencyValues(finalStateByTaskSlug.get(check.targetTaskSlug), check.targetPath)
      : [];

    const evidenceBase = {
      sourcePath: check.sourcePath,
      targetPath: check.targetPath,
      sourceFound: sourceValues.length > 0,
      targetFound: targetValues.length > 0,
    };

    if (!hasSource || !hasTarget || sourceValues.length === 0 || targetValues.length === 0) {
      const missing: string[] = [];
      if (!hasSource) missing.push(`source session ${check.sourceTaskSlug}`);
      else if (sourceValues.length === 0) missing.push(`source output ${check.sourcePath}`);
      if (!hasTarget) missing.push(`target session ${check.targetTaskSlug}`);
      else if (targetValues.length === 0) missing.push(`target output ${check.targetPath}`);
      return {
        ...base,
        status: "failed" as const,
        score: 0,
        evidence: evidenceBase,
        errorMessage: `Missing prior output for consistency check: ${missing.join(", ")}.`,
      };
    }

    const normalizedSources = sourceValues.map(normalizeConsistencyValue);
    const normalizedTargets = targetValues.map(normalizeConsistencyValue);
    let matched: string | null = null;
    if (check.rule === "equal-normalized") {
      matched =
        sourceValues.find((_, index) => normalizedTargets.includes(normalizedSources[index]!)) ?? null;
    } else {
      const sourceIndex = normalizedSources.findIndex((source) =>
        normalizedTargets.some((target) => target.includes(source)),
      );
      matched = sourceIndex >= 0 ? sourceValues[sourceIndex]! : null;
    }

    const passed = matched !== null;
    return {
      ...base,
      status: passed ? ("passed" as const) : ("failed" as const),
      score: passed ? 1 : 0,
      evidence: { ...evidenceBase, matchedValue: matched },
      ...(passed
        ? {}
        : {
            errorMessage: `Output from ${check.sourceTaskSlug} (${check.sourcePath}) was not carried into ${check.targetTaskSlug} (${check.targetPath}).`,
          }),
    };
  });
}
