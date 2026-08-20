import {
  boolean,
  check,
  integer,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { benchmarkCases } from "./benchmark-cases";
import type { JsonValue } from "./model-catalog";

export type BenchmarkRunStatus =
  | "queued"
  | "waiting_for_agent"
  | "agent_connected"
  | "starting"
  | "running"
  | "scoring"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type BenchmarkExecutionMode = "internal" | "external-agent";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  dailyRunLimit: integer("daily_run_limit").notNull().default(3),
}, (table) => [
  check("profiles_daily_run_limit_check", sql`${table.dailyRunLimit} >= 0`),
]);

export const benchmarkRuns = pgTable("benchmark_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  guestId: text("guest_id"),
  caseId: uuid("case_id").notNull().references(() => benchmarkCases.id, { onDelete: "restrict" }),
  runnerId: uuid("runner_id"),
  executionMode: text("execution_mode").$type<BenchmarkExecutionMode>().notNull().default("internal"),
  status: text("status").$type<BenchmarkRunStatus>().notNull().default("queued"),
  score: numeric("score", { mode: "number" }),
  liveViewUrl: text("live_view_url"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  metadata: jsonb("metadata").$type<JsonValue>().notNull().default({}),
  agentName: text("agent_name"),
  agentVersion: text("agent_version"),
  baseModel: text("base_model"),
  modelProvider: text("model_provider"),
  modelId: text("model_id"),
  reasoningEffort: text("reasoning_effort"),
  modelCatalogVerifiedAt: timestamp("model_catalog_verified_at", { withTimezone: true, mode: "string" }),
  browserEnvironment: jsonb("browser_environment").$type<JsonValue>().notNull().default({}),
  isPublic: boolean("is_public").notNull().default(true),
}, (table) => [
  index("idx_benchmark_runs_user_id_created_at").on(table.userId, table.createdAt),
  index("idx_benchmark_runs_guest_id_created_at").on(table.guestId, table.createdAt),
  index("idx_benchmark_runs_status").on(table.status),
  index("idx_benchmark_runs_public_leaderboard")
    .on(table.score.desc(), table.completedAt)
    .where(sql`${table.status} in ('completed', 'failed', 'timeout') and ${table.isPublic} = true and ${table.score} is not null`),
  check(
    "benchmark_runs_status_check",
    sql`${table.status} in ('queued', 'waiting_for_agent', 'agent_connected', 'starting', 'running', 'scoring', 'completed', 'failed', 'cancelled', 'timeout')`,
  ),
  check("benchmark_runs_score_check", sql`${table.score} is null or (${table.score} >= 0 and ${table.score} <= 1)`),
  check("benchmark_runs_identity_check", sql`${table.userId} is not null or ${table.guestId} is not null`),
]);

export const runEvents = pgTable("run_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<JsonValue>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_run_events_run_id_created_at").on(table.runId, table.createdAt),
]);

export const artifacts = pgTable("artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  storagePath: text("storage_path"),
  url: text("url"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_artifacts_run_id").on(table.runId),
]);
