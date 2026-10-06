import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ModelCatalogStatus = "active" | "preview" | "legacy" | "deprecated";
export type ModelCatalogSyncStatus = "running" | "completed" | "failed" | "skipped";

export const modelCatalog = pgTable("model_catalog", {
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  family: text("family"),
  status: text("status").$type<ModelCatalogStatus>().notNull().default("active"),
  reasoningEfforts: text("reasoning_efforts").array().notNull().default([]),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "string" }),
  sourceRefs: jsonb("source_refs").$type<JsonValue>().notNull().default([]),
  sourcePriority: integer("source_priority").notNull().default(100),
  benchmarkPopularity: integer("benchmark_popularity").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  primaryKey({ columns: [table.provider, table.modelId] }),
  check("model_catalog_provider_length", sql`char_length(${table.provider}) between 1 and 80`),
  check("model_catalog_model_id_length", sql`char_length(${table.modelId}) between 1 and 200`),
  check("model_catalog_display_name_length", sql`char_length(${table.displayName}) between 1 and 200`),
  check("model_catalog_status_check", sql`${table.status} in ('active', 'preview', 'legacy', 'deprecated')`),
  check("model_catalog_source_refs_array", sql`jsonb_typeof(${table.sourceRefs}) = 'array'`),
  index("model_catalog_search_idx").on(
    table.status,
    table.sourcePriority,
    table.releasedAt.desc().nullsLast(),
  ),
  index("model_catalog_last_seen_idx").on(table.lastSeenAt),
]);

export const modelCatalogSyncRuns = pgTable("model_catalog_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  status: text("status").$type<ModelCatalogSyncStatus>().notNull().default("running"),
  discoveredCount: integer("discovered_count").notNull().default(0),
  upsertedCount: integer("upserted_count").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  check(
    "model_catalog_sync_status_check",
    sql`${table.status} in ('running', 'completed', 'failed', 'skipped')`,
  ),
  index("model_catalog_sync_runs_source_started_idx").on(
    table.source,
    table.startedAt.desc(),
  ),
]);
