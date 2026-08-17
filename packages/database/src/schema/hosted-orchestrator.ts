import {
  boolean,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { benchmarkCaseRevisions, benchmarkCases } from "./benchmark-cases";
import { benchmarkRuns } from "./web-control-plane";
import type { JsonValue } from "./model-catalog";

export type BenchmarkAttemptStatus =
  | "created" | "running" | "scoring" | "completed"
  | "failed" | "cancelled" | "timeout";
export type HostedSessionStatus =
  | "created" | "active" | "scoring" | "completed" | "failed" | "expired";
export type HostedResultStatus = "passed" | "failed" | "error";

export const benchmarkAttempts = pgTable("benchmark_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => benchmarkCases.id, { onDelete: "restrict" }),
  caseRevisionId: uuid("case_revision_id").references(() => benchmarkCaseRevisions.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(),
  suiteSlug: text("suite_slug").notNull(),
  suiteVersion: text("suite_version").notNull(),
  status: text("status").$type<BenchmarkAttemptStatus>().notNull().default("created"),
  aggregateScore: numeric("aggregate_score", { mode: "number" }),
  scoringSummary: jsonb("scoring_summary").$type<JsonValue>().notNull().default({}),
  metadata: jsonb("metadata").$type<JsonValue>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  index("idx_benchmark_attempts_run_id").on(table.runId),
  index("idx_benchmark_attempts_case_id").on(table.caseId),
  index("idx_benchmark_attempts_status").on(table.status),
  uniqueIndex("idx_benchmark_attempts_unique_hosted_run_case")
    .on(table.runId, table.caseId, table.provider)
    .where(sql`${table.provider} = 'hosted-web'`),
]);

export const hostedWebSessions = pgTable("hosted_web_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => benchmarkCases.id, { onDelete: "restrict" }),
  attemptId: uuid("attempt_id").references(() => benchmarkAttempts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("hosted-web"),
  app: text("app").notNull(),
  taskSlug: text("task_slug").notNull(),
  taskVersion: text("task_version").notNull().default("v1"),
  sequenceIndex: integer("sequence_index").notNull().default(0),
  weight: numeric("weight", { mode: "number" }).notNull().default(1),
  required: boolean("required").notNull().default(true),
  seedVersion: text("seed_version").notNull(),
  startUrl: text("start_url").notNull(),
  sessionTokenHash: text("session_token_hash").notNull(),
  status: text("status").$type<HostedSessionStatus>().notNull().default("created"),
  metadata: jsonb("metadata").$type<JsonValue>().notNull().default({}),
  createdByUserId: uuid("created_by_user_id"),
  createdByGuestId: text("created_by_guest_id"),
  firstSeenIp: inet("first_seen_ip"),
  lastSeenIp: inet("last_seen_ip"),
  firstSeenUserAgent: text("first_seen_user_agent"),
  lastSeenUserAgent: text("last_seen_user_agent"),
  accessCount: integer("access_count").notNull().default(0),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true, mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  unique("hosted_web_sessions_session_token_hash_key").on(table.sessionTokenHash),
  index("idx_hosted_web_sessions_attempt_id").on(table.attemptId),
]);

export const hostedWebResults = pgTable("hosted_web_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => hostedWebSessions.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => benchmarkAttempts.id, { onDelete: "cascade" }),
  app: text("app"),
  taskSlug: text("task_slug"),
  status: text("status").$type<HostedResultStatus>().notNull(),
  score: numeric("score", { mode: "number" }).notNull(),
  weight: numeric("weight", { mode: "number" }).notNull().default(1),
  summary: text("summary").notNull(),
  finalState: jsonb("final_state").$type<JsonValue>().notNull().default({}),
  evaluators: jsonb("evaluators").$type<JsonValue>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_hosted_web_results_attempt_created_at").on(table.attemptId, table.createdAt),
]);
