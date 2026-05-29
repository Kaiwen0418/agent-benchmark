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
