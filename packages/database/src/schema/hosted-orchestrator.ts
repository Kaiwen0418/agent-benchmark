import {
  boolean,
  check,
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
export type HostedCallbackOutboxStatus = "pending" | "delivering" | "delivered" | "dead";
export type OrchestratorCommandDeadLetterStatus = "dead" | "replayed" | "resolved";

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
  check(
    "benchmark_attempts_status_check",
    sql`${table.status} in ('created', 'running', 'scoring', 'completed', 'failed', 'cancelled', 'timeout')`,
  ),
  check(
    "benchmark_attempts_aggregate_score_check",
    sql`${table.aggregateScore} is null or (${table.aggregateScore} >= 0 and ${table.aggregateScore} <= 1)`,
  ),
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
  check(
    "hosted_web_sessions_status_check",
    sql`${table.status} in ('created', 'active', 'scoring', 'completed', 'failed', 'expired')`,
  ),
  check("hosted_web_sessions_weight_check", sql`${table.weight} >= 0`),
  check("hosted_web_sessions_access_count_check", sql`${table.accessCount} >= 0`),
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
  uniqueIndex("idx_hosted_web_results_unique_session").on(table.sessionId),
  check("hosted_web_results_status_check", sql`${table.status} in ('passed', 'failed', 'error')`),
  check("hosted_web_results_score_check", sql`${table.score} >= 0 and ${table.score} <= 1`),
  check("hosted_web_results_weight_check", sql`${table.weight} >= 0`),
]);

export const benchmarkAttemptScores = pgTable("benchmark_attempt_scores", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").notNull().references(() => benchmarkAttempts.id, { onDelete: "cascade" }),
  status: text("status").$type<HostedResultStatus>().notNull(),
  score: numeric("score", { mode: "number" }).notNull(),
  summary: text("summary").notNull(),
  breakdown: jsonb("breakdown").$type<JsonValue>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_benchmark_attempt_scores_attempt_created_at").on(table.attemptId, table.createdAt),
  uniqueIndex("idx_benchmark_attempt_scores_unique_attempt").on(table.attemptId),
  check("benchmark_attempt_scores_status_check", sql`${table.status} in ('passed', 'failed', 'error')`),
  check("benchmark_attempt_scores_score_check", sql`${table.score} >= 0 and ${table.score} <= 1`),
]);

export const hostedWebEvents = pgTable("hosted_web_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => hostedWebSessions.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => benchmarkAttempts.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  name: text("name"),
  payload: jsonb("payload").$type<JsonValue>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_hosted_web_events_session_created_at").on(table.sessionId, table.createdAt),
  index("idx_hosted_web_events_run_created_at").on(table.runId, table.createdAt),
  index("idx_hosted_web_events_attempt_created_at").on(table.attemptId, table.createdAt),
  index("idx_hosted_web_events_type").on(table.type),
]);

export const hostedWebAccessLogs = pgTable("hosted_web_access_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => hostedWebSessions.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => benchmarkAttempts.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => benchmarkRuns.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  metadata: jsonb("metadata").$type<JsonValue>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_hosted_web_access_logs_session_created_at").on(table.sessionId, table.createdAt),
  index("idx_hosted_web_access_logs_run_created_at").on(table.runId, table.createdAt),
]);

export const hostedCallbackOutbox = pgTable("hosted_callback_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  attemptId: uuid("attempt_id").notNull().references(() => benchmarkAttempts.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull(),
  eventType: text("event_type").notNull().default("run_completion"),
  payload: jsonb("payload").$type<JsonValue>().notNull(),
  status: text("status").$type<HostedCallbackOutboxStatus>().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "string" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "string" }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  unique("hosted_callback_outbox_attempt_id_event_type_key").on(table.attemptId, table.eventType),
  index("idx_hosted_callback_outbox_pending").on(table.nextAttemptAt, table.createdAt)
    .where(sql`${table.status} in ('pending', 'delivering')`),
  check("hosted_callback_outbox_event_type_check", sql`${table.eventType} = 'run_completion'`),
  check(
    "hosted_callback_outbox_status_check",
    sql`${table.status} in ('pending', 'delivering', 'delivered', 'dead')`,
  ),
  check("hosted_callback_outbox_attempts_check", sql`${table.attempts} >= 0`),
]);

export const orchestratorCommandDeadLetters = pgTable("orchestrator_command_dead_letters", {
  id: uuid("id").defaultRandom().primaryKey(),
  commandId: text("command_id").notNull().unique(),
  stream: text("stream").notNull(),
  messageId: text("message_id").notNull(),
  partition: integer("partition").notNull(),
  partitionKey: text("partition_key"),
  payloadType: text("payload_type").notNull(),
  payload: jsonb("payload").$type<JsonValue>().notNull().default({}),
  errorCode: text("error_code").notNull(),
  errorMessage: text("error_message").notNull(),
  attempts: integer("attempts").notNull(),
  status: text("status").$type<OrchestratorCommandDeadLetterStatus>().notNull().default("dead"),
  replayCommandId: text("replay_command_id"),
  replayedAt: timestamp("replayed_at", { withTimezone: true, mode: "string" }),
  scrubbedAt: timestamp("scrubbed_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_orchestrator_command_dead_letters_status_created").on(table.status, table.createdAt.desc()),
  index("idx_orchestrator_command_dead_letters_unscrubbed").on(table.createdAt)
    .where(sql`${table.scrubbedAt} is null`),
  index("idx_orchestrator_command_dead_letters_status_updated").on(table.status, table.updatedAt),
  index("idx_orchestrator_command_dead_letters_created").on(table.createdAt.desc(), table.id.desc()),
  check(
    "orchestrator_command_dead_letters_status_check",
    sql`${table.status} in ('dead', 'replayed', 'resolved')`,
  ),
  check("orchestrator_command_dead_letters_attempts_check", sql`${table.attempts} > 0`),
]);
