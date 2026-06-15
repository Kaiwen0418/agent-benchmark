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

export const hostedWebSuiteScoreResultSchema = z.object({
  score: z.number().min(0).max(1),
  status: hostedWebEvaluatorStatusSchema,
  summary: z.string(),
  breakdown: z.object({
    aggregation: z.literal("weighted-required-suite"),
    sessions: z.array(hostedWebSuiteSessionScoreSchema),
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
  passSummary?: string;
  failSummary?: string;
}): HostedWebSuiteScoreResult {
  const sessions = params.sessions;
  const required = sessions.filter((session) => session.required !== false);
  const requiredStatus = required.map((session) => session.status);
  const hasError = requiredStatus.some((status) => status === "error");
  const requiredPassed = required.every((session) => session.status === "passed");
  const totalWeight = sessions.reduce((sum, session) => sum + Math.max(session.weight, 0), 0);
  const weightedScore =
    totalWeight > 0
      ? sessions.reduce((sum, session) => sum + session.score * Math.max(session.weight, 0), 0) / totalWeight
      : 0;
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
    },
  };
}
