import {
  bigint,
  boolean,
  numeric,
  pgView,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const publicHostedRunSummaries = pgView("public_hosted_run_summaries", {
  runId: uuid("run_id"),
  caseId: uuid("case_id"),
  benchmarkTitle: text("benchmark_title"),
  suiteSlug: text("suite_slug"),
  suiteVersion: text("suite_version"),
  observedUserAgent: text("observed_user_agent"),
}).existing();

export const publicHostedRunTasks = pgView("public_hosted_run_tasks", {
  runId: uuid("run_id"),
  app: text("app"),
  taskSlug: text("task_slug"),
  status: text("status").$type<"passed" | "failed" | "error">(),
  score: numeric("score", { mode: "number" }),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
}).existing();

export const publicHostedRunConsistencyChecks = pgView("public_hosted_run_consistency_checks", {
  runId: uuid("run_id"),
  sequenceIndex: bigint("sequence_index", { mode: "number" }),
  name: text("name"),
  sourceTaskSlug: text("source_task_slug"),
  targetTaskSlug: text("target_task_slug"),
  status: text("status").$type<"passed" | "failed">(),
  score: numeric("score", { mode: "number" }),
  required: boolean("required"),
  failureReason: text("failure_reason"),
}).existing();
