import { z } from "zod";

export const runStatusSchema = z.enum([
  "queued",
  "waiting_for_agent",
  "agent_connected",
  "starting",
  "running",
  "scoring",
  "completed",
  "failed",
  "cancelled",
  "timeout",
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

export const runEventTypeSchema = z.enum([
  "run.created",
  "run.assigned",
  "run.starting",
  "run.running",
  "agent.connected",
  "live.frame",
  "tool.call",
  "tool.result",
  "mcp.request",
  "mcp.response",
  "mcp.error",
  "hosted.session.created",
  "hosted.page.load",
  "hosted.action",
  "hosted.task_signal",
  "hosted.score",
  "artifact.created",
  "score.updated",
  "run.completed",
  "run.failed",
]);

export type RunEventType = z.infer<typeof runEventTypeSchema>;

export const benchmarkCaseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  difficulty: z.string(),
  provider: z.enum(["native", "hosted-web", "webarena"]).default("native"),
  metadata: z.record(z.any()).default({}),
  isPublic: z.boolean(),
  createdAt: z.string(),
});

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export const hostedWebSuiteSessionSchema = z.object({
  app: z.string().min(1),
  taskSlug: z.string().min(1),
  title: z.string().optional(),
  goal: z.string().optional(),
  startPath: z.string().optional(),
  taskVersion: z.string().default("v1"),
  seedVersion: z.string().optional(),
  sequenceIndex: z.number().int().nonnegative().default(0),
  weight: z.number().nonnegative().default(1),
  required: z.boolean().default(true),
  metadata: z.record(z.any()).default({}),
});

export type HostedWebSuiteSession = z.infer<typeof hostedWebSuiteSessionSchema>;

export const hostedWebSuiteMetadataSchema = z.object({
  suiteSlug: z.string().min(1).default("hosted-web-suite"),
  suiteVersion: z.string().min(1).default("v1"),
  app: z.string().min(1).optional(),
  taskSlug: z.string().min(1).optional(),
  title: z.string().optional(),
  goal: z.string().optional(),
  startPath: z.string().optional(),
  taskVersion: z.string().default("v1"),
  seedVersion: z.string().optional(),
  sessions: z.array(hostedWebSuiteSessionSchema).default([]),
  metadata: z.record(z.any()).default({}),
});

export type HostedWebSuiteMetadata = z.infer<typeof hostedWebSuiteMetadataSchema>;

export const runnerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["online", "offline", "busy"]),
  capacity: z.number().int().nonnegative(),
  currentLoad: z.number().int().nonnegative(),
  lastHeartbeat: z.string().nullable(),
  createdAt: z.string(),
});

export type Runner = z.infer<typeof runnerSchema>;

export const runExecutionModeSchema = z.enum(["internal", "external-agent"]);

export type RunExecutionMode = z.infer<typeof runExecutionModeSchema>;

export const benchmarkRunSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  guestId: z.string().nullable(),
  caseId: z.string().uuid(),
  runnerId: z.string().uuid().nullable(),
  executionMode: runExecutionModeSchema,
  status: runStatusSchema,
  score: z.number().nullable(),
  liveViewUrl: z.string().url().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>;

export const quotaModeSchema = z.enum(["guest", "user"]);

export type QuotaMode = z.infer<typeof quotaModeSchema>;

export const quotaStatusSchema = z.object({
  mode: quotaModeSchema,
  isAuthenticated: z.boolean(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.string().nullable(),
});

export type QuotaStatus = z.infer<typeof quotaStatusSchema>;

export const runEventSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  type: runEventTypeSchema,
  payload: z.record(z.any()),
  createdAt: z.string(),
});

export type RunEvent = z.infer<typeof runEventSchema>;

export const artifactSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  type: z.string(),
  storagePath: z.string().nullable(),
  url: z.string().url().nullable(),
  createdAt: z.string(),
});

export type Artifact = z.infer<typeof artifactSchema>;

export const createRunInputSchema = z.object({
  caseId: z.string().uuid(),
  executionMode: runExecutionModeSchema.default("external-agent"),
});

export type CreateRunInput = z.infer<typeof createRunInputSchema>;

export const runnerRegisterInputSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().positive().default(1),
});

export type RunnerRegisterInput = z.infer<typeof runnerRegisterInputSchema>;

export const runnerHeartbeatInputSchema = z.object({
  runnerId: z.string().uuid(),
  currentLoad: z.number().int().nonnegative(),
  status: z.enum(["online", "offline", "busy"]),
});

export type RunnerHeartbeatInput = z.infer<typeof runnerHeartbeatInputSchema>;

export const appendRunEventInputSchema = z.object({
  type: runEventTypeSchema,
  payload: z.record(z.any()).default({}),
});

export type AppendRunEventInput = z.infer<typeof appendRunEventInputSchema>;

export const completeRunInputSchema = z.object({
  status: z.enum(["completed", "failed", "cancelled", "timeout"]),
  score: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  artifacts: z
    .array(artifactSchema.omit({ id: true, runId: true, createdAt: true }))
    .default([]),
});

export type CompleteRunInput = z.infer<typeof completeRunInputSchema>;
