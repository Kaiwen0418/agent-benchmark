import { z } from "zod";
export const runStatusSchema = z.enum([
    "queued",
    "starting",
    "running",
    "scoring",
    "completed",
    "failed",
    "cancelled",
    "timeout",
]);
export const runEventTypeSchema = z.enum([
    "run.created",
    "run.assigned",
    "run.starting",
    "run.running",
    "tool.call",
    "tool.result",
    "artifact.created",
    "score.updated",
    "run.completed",
    "run.failed",
]);
export const benchmarkCaseSchema = z.object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    difficulty: z.string(),
    isPublic: z.boolean(),
    createdAt: z.string(),
});
export const runnerSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.enum(["online", "offline", "busy"]),
    capacity: z.number().int().nonnegative(),
    currentLoad: z.number().int().nonnegative(),
    lastHeartbeat: z.string().nullable(),
    createdAt: z.string(),
});
export const benchmarkRunSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid().nullable(),
    guestId: z.string().nullable(),
    caseId: z.string().uuid(),
    runnerId: z.string().uuid().nullable(),
    status: runStatusSchema,
    score: z.number().nullable(),
    liveViewUrl: z.string().url().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
});
export const quotaModeSchema = z.enum(["guest", "user"]);
export const quotaStatusSchema = z.object({
    mode: quotaModeSchema,
    isAuthenticated: z.boolean(),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    resetAt: z.string().nullable(),
});
export const runEventSchema = z.object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    type: runEventTypeSchema,
    payload: z.record(z.any()),
    createdAt: z.string(),
});
export const artifactSchema = z.object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    type: z.string(),
    storagePath: z.string().nullable(),
    url: z.string().url().nullable(),
    createdAt: z.string(),
});
export const createRunInputSchema = z.object({
    caseId: z.string().uuid(),
});
export const runnerRegisterInputSchema = z.object({
    name: z.string().min(1),
    capacity: z.number().int().positive().default(1),
});
export const runnerHeartbeatInputSchema = z.object({
    runnerId: z.string().uuid(),
    currentLoad: z.number().int().nonnegative(),
    status: z.enum(["online", "offline", "busy"]),
});
export const appendRunEventInputSchema = z.object({
    type: runEventTypeSchema,
    payload: z.record(z.any()).default({}),
});
export const completeRunInputSchema = z.object({
    status: z.enum(["completed", "failed", "cancelled", "timeout"]),
    score: z.number().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    artifacts: z
        .array(artifactSchema.omit({ id: true, runId: true, createdAt: true }))
        .default([]),
});
