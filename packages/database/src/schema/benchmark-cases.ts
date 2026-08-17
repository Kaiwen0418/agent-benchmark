import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./model-catalog";

export type BenchmarkProvider = "native" | "hosted-web" | "webarena";

export const benchmarkCases = pgTable("benchmark_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  provider: text("provider").$type<BenchmarkProvider>().default("native"),
  currentRevisionId: uuid("current_revision_id"),
  metadata: jsonb("metadata").$type<JsonValue>().notNull().default({}),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("benchmark_cases_provider_public_idx").on(table.provider, table.isPublic),
]);

export const benchmarkCaseRevisions = pgTable("benchmark_case_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull().references(() => benchmarkCases.id, { onDelete: "restrict" }),
  revision: text("revision").notNull(),
  contentHash: text("content_hash").notNull(),
  manifest: jsonb("manifest").$type<JsonValue>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  unique("benchmark_case_revisions_case_id_id_key").on(table.caseId, table.id),
  unique("benchmark_case_revisions_case_id_revision_key").on(table.caseId, table.revision),
  unique("benchmark_case_revisions_case_id_content_hash_key").on(table.caseId, table.contentHash),
]);
