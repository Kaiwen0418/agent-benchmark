CREATE TABLE "benchmark_case_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"revision" text NOT NULL,
	"content_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_case_revisions_case_id_id_key" UNIQUE("case_id","id"),
	CONSTRAINT "benchmark_case_revisions_case_id_revision_key" UNIQUE("case_id","revision"),
	CONSTRAINT "benchmark_case_revisions_case_id_content_hash_key" UNIQUE("case_id","content_hash")
);
--> statement-breakpoint
CREATE TABLE "benchmark_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"difficulty" text NOT NULL,
	"provider" text DEFAULT 'native' NOT NULL,
	"current_revision_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_cases_slug_unique" UNIQUE("slug"),
	CONSTRAINT "benchmark_cases_metadata_is_display_only" CHECK (not ("benchmark_cases"."metadata" ?| array['sessions', 'questionVariants', 'taskConfig']))
);
--> statement-breakpoint
CREATE TABLE "model_catalog" (
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"family" text,
	"status" text DEFAULT 'active' NOT NULL,
	"reasoning_efforts" text[] DEFAULT '{}' NOT NULL,
	"released_at" timestamp with time zone,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_priority" integer DEFAULT 100 NOT NULL,
	"benchmark_popularity" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "model_catalog_provider_model_id_pk" PRIMARY KEY("provider","model_id"),
	CONSTRAINT "model_catalog_provider_length" CHECK (char_length("model_catalog"."provider") between 1 and 80),
	CONSTRAINT "model_catalog_model_id_length" CHECK (char_length("model_catalog"."model_id") between 1 and 200),
	CONSTRAINT "model_catalog_display_name_length" CHECK (char_length("model_catalog"."display_name") between 1 and 200),
	CONSTRAINT "model_catalog_status_check" CHECK ("model_catalog"."status" in ('active', 'preview', 'legacy', 'deprecated')),
	CONSTRAINT "model_catalog_source_refs_array" CHECK (jsonb_typeof("model_catalog"."source_refs") = 'array')
);
--> statement-breakpoint
CREATE TABLE "model_catalog_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"upserted_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "model_catalog_sync_status_check" CHECK ("model_catalog_sync_runs"."status" in ('running', 'completed', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"type" text NOT NULL,
	"storage_path" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"guest_id" text,
	"case_id" uuid NOT NULL,
	"runner_id" uuid,
	"execution_mode" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"score" numeric,
	"live_view_url" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agent_name" text,
	"agent_version" text,
	"base_model" text,
	"model_provider" text,
	"model_id" text,
	"reasoning_effort" text,
	"model_catalog_verified_at" timestamp with time zone,
	"browser_environment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	CONSTRAINT "benchmark_runs_status_check" CHECK ("benchmark_runs"."status" in ('queued', 'waiting_for_agent', 'agent_connected', 'starting', 'running', 'scoring', 'completed', 'failed', 'cancelled', 'timeout')),
	CONSTRAINT "benchmark_runs_score_check" CHECK ("benchmark_runs"."score" is null or ("benchmark_runs"."score" >= 0 and "benchmark_runs"."score" <= 1)),
	CONSTRAINT "benchmark_runs_identity_check" CHECK ("benchmark_runs"."user_id" is not null or "benchmark_runs"."guest_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"daily_run_limit" integer DEFAULT 3 NOT NULL,
	CONSTRAINT "profiles_daily_run_limit_check" CHECK ("profiles"."daily_run_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_attempt_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"status" text NOT NULL,
	"score" numeric NOT NULL,
	"summary" text NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_attempt_scores_status_check" CHECK ("benchmark_attempt_scores"."status" in ('passed', 'failed', 'error')),
	CONSTRAINT "benchmark_attempt_scores_score_check" CHECK ("benchmark_attempt_scores"."score" >= 0 and "benchmark_attempt_scores"."score" <= 1)
);
--> statement-breakpoint
CREATE TABLE "benchmark_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_revision_id" uuid,
	"provider" text NOT NULL,
	"suite_slug" text NOT NULL,
	"suite_version" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"aggregate_score" numeric,
	"scoring_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "benchmark_attempts_status_check" CHECK ("benchmark_attempts"."status" in ('created', 'running', 'scoring', 'completed', 'failed', 'cancelled', 'timeout')),
	CONSTRAINT "benchmark_attempts_aggregate_score_check" CHECK ("benchmark_attempts"."aggregate_score" is null or ("benchmark_attempts"."aggregate_score" >= 0 and "benchmark_attempts"."aggregate_score" <= 1))
);
--> statement-breakpoint
CREATE TABLE "hosted_callback_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"event_type" text DEFAULT 'run_completion' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_callback_outbox_attempt_id_event_type_key" UNIQUE("attempt_id","event_type"),
	CONSTRAINT "hosted_callback_outbox_event_type_check" CHECK ("hosted_callback_outbox"."event_type" = 'run_completion'),
	CONSTRAINT "hosted_callback_outbox_status_check" CHECK ("hosted_callback_outbox"."status" in ('pending', 'delivering', 'delivered', 'dead')),
	CONSTRAINT "hosted_callback_outbox_attempts_check" CHECK ("hosted_callback_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hosted_web_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"attempt_id" uuid,
	"run_id" uuid,
	"event" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"referer" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_web_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_id" uuid,
	"type" text NOT NULL,
	"name" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_web_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"attempt_id" uuid,
	"app" text,
	"task_slug" text,
	"status" text NOT NULL,
	"score" numeric NOT NULL,
	"weight" numeric DEFAULT 1 NOT NULL,
	"summary" text NOT NULL,
	"final_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_web_results_status_check" CHECK ("hosted_web_results"."status" in ('passed', 'failed', 'error')),
	CONSTRAINT "hosted_web_results_score_check" CHECK ("hosted_web_results"."score" >= 0 and "hosted_web_results"."score" <= 1),
	CONSTRAINT "hosted_web_results_weight_check" CHECK ("hosted_web_results"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hosted_web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"attempt_id" uuid,
	"provider" text DEFAULT 'hosted-web' NOT NULL,
	"app" text NOT NULL,
	"task_slug" text NOT NULL,
	"task_version" text DEFAULT 'v1' NOT NULL,
	"sequence_index" integer DEFAULT 0 NOT NULL,
	"weight" numeric DEFAULT 1 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"seed_version" text NOT NULL,
	"start_url" text NOT NULL,
	"session_token_hash" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_by_guest_id" text,
	"first_seen_ip" "inet",
	"last_seen_ip" "inet",
	"first_seen_user_agent" text,
	"last_seen_user_agent" text,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "hosted_web_sessions_session_token_hash_key" UNIQUE("session_token_hash"),
	CONSTRAINT "hosted_web_sessions_status_check" CHECK ("hosted_web_sessions"."status" in ('created', 'active', 'scoring', 'completed', 'failed', 'expired')),
	CONSTRAINT "hosted_web_sessions_weight_check" CHECK ("hosted_web_sessions"."weight" >= 0),
	CONSTRAINT "hosted_web_sessions_access_count_check" CHECK ("hosted_web_sessions"."access_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orchestrator_command_dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"command_id" text NOT NULL,
	"stream" text NOT NULL,
	"message_id" text NOT NULL,
	"partition" integer NOT NULL,
	"partition_key" text,
	"payload_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text NOT NULL,
	"error_message" text NOT NULL,
	"attempts" integer NOT NULL,
	"status" text DEFAULT 'dead' NOT NULL,
	"replay_command_id" text,
	"replayed_at" timestamp with time zone,
	"scrubbed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orchestrator_command_dead_letters_command_id_unique" UNIQUE("command_id"),
	CONSTRAINT "orchestrator_command_dead_letters_status_check" CHECK ("orchestrator_command_dead_letters"."status" in ('dead', 'replayed', 'resolved')),
	CONSTRAINT "orchestrator_command_dead_letters_attempts_check" CHECK ("orchestrator_command_dead_letters"."attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "benchmark_case_revisions" ADD CONSTRAINT "benchmark_case_revisions_case_id_benchmark_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."benchmark_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_case_id_benchmark_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."benchmark_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempt_scores" ADD CONSTRAINT "benchmark_attempt_scores_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempt_scores" ADD CONSTRAINT "benchmark_attempt_scores_attempt_id_benchmark_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."benchmark_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempts" ADD CONSTRAINT "benchmark_attempts_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempts" ADD CONSTRAINT "benchmark_attempts_case_id_benchmark_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."benchmark_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempts" ADD CONSTRAINT "benchmark_attempts_case_revision_id_benchmark_case_revisions_id_fk" FOREIGN KEY ("case_revision_id") REFERENCES "public"."benchmark_case_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_callback_outbox" ADD CONSTRAINT "hosted_callback_outbox_attempt_id_benchmark_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."benchmark_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_access_logs" ADD CONSTRAINT "hosted_web_access_logs_session_id_hosted_web_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."hosted_web_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_access_logs" ADD CONSTRAINT "hosted_web_access_logs_attempt_id_benchmark_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."benchmark_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_access_logs" ADD CONSTRAINT "hosted_web_access_logs_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_events" ADD CONSTRAINT "hosted_web_events_session_id_hosted_web_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."hosted_web_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_events" ADD CONSTRAINT "hosted_web_events_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_events" ADD CONSTRAINT "hosted_web_events_attempt_id_benchmark_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."benchmark_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_results" ADD CONSTRAINT "hosted_web_results_session_id_hosted_web_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."hosted_web_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_results" ADD CONSTRAINT "hosted_web_results_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_results" ADD CONSTRAINT "hosted_web_results_attempt_id_benchmark_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."benchmark_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_sessions" ADD CONSTRAINT "hosted_web_sessions_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_sessions" ADD CONSTRAINT "hosted_web_sessions_case_id_benchmark_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."benchmark_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_web_sessions" ADD CONSTRAINT "hosted_web_sessions_attempt_id_benchmark_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."benchmark_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_cases_provider_public_idx" ON "benchmark_cases" USING btree ("provider","is_public");--> statement-breakpoint
CREATE INDEX "model_catalog_search_idx" ON "model_catalog" USING btree ("status","source_priority","released_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "model_catalog_last_seen_idx" ON "model_catalog" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "model_catalog_sync_runs_source_started_idx" ON "model_catalog_sync_runs" USING btree ("source","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_artifacts_run_id" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_user_id_created_at" ON "benchmark_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_guest_id_created_at" ON "benchmark_runs" USING btree ("guest_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_status" ON "benchmark_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_benchmark_runs_public_leaderboard" ON "benchmark_runs" USING btree ("score" DESC NULLS LAST,"completed_at") WHERE "benchmark_runs"."status" in ('completed', 'failed', 'timeout') and "benchmark_runs"."is_public" = true and "benchmark_runs"."score" is not null;--> statement-breakpoint
CREATE INDEX "idx_run_events_run_id_created_at" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_benchmark_attempt_scores_attempt_created_at" ON "benchmark_attempt_scores" USING btree ("attempt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_benchmark_attempt_scores_unique_attempt" ON "benchmark_attempt_scores" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_benchmark_attempts_run_id" ON "benchmark_attempts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_benchmark_attempts_case_id" ON "benchmark_attempts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_benchmark_attempts_status" ON "benchmark_attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_benchmark_attempts_unique_hosted_run_case" ON "benchmark_attempts" USING btree ("run_id","case_id","provider") WHERE "benchmark_attempts"."provider" = 'hosted-web';--> statement-breakpoint
CREATE INDEX "idx_hosted_callback_outbox_pending" ON "hosted_callback_outbox" USING btree ("next_attempt_at","created_at") WHERE "hosted_callback_outbox"."status" in ('pending', 'delivering');--> statement-breakpoint
CREATE INDEX "idx_hosted_web_access_logs_session_created_at" ON "hosted_web_access_logs" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_access_logs_run_created_at" ON "hosted_web_access_logs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_events_session_created_at" ON "hosted_web_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_events_run_created_at" ON "hosted_web_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_events_attempt_created_at" ON "hosted_web_events" USING btree ("attempt_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_events_type" ON "hosted_web_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_results_attempt_created_at" ON "hosted_web_results" USING btree ("attempt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_hosted_web_results_unique_session" ON "hosted_web_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_hosted_web_sessions_attempt_id" ON "hosted_web_sessions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_orchestrator_command_dead_letters_status_created" ON "orchestrator_command_dead_letters" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_orchestrator_command_dead_letters_unscrubbed" ON "orchestrator_command_dead_letters" USING btree ("created_at") WHERE "orchestrator_command_dead_letters"."scrubbed_at" is null;--> statement-breakpoint
CREATE INDEX "idx_orchestrator_command_dead_letters_status_updated" ON "orchestrator_command_dead_letters" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_orchestrator_command_dead_letters_created" ON "orchestrator_command_dead_letters" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);