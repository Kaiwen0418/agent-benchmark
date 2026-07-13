export type Json = string | number | boolean | null | { [key: string]: any } | any[];

export type Database = {
  public: {
    Tables: {
      benchmark_cases: {
        Row: {
          category: string;
          created_at: string;
          current_revision_id: string | null;
          description: string;
          difficulty: string;
          id: string;
          is_public: boolean;
          metadata: { [key: string]: any };
          provider: "native" | "hosted-web" | "webarena" | null;
          slug: string;
          title: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          current_revision_id?: string | null;
          description: string;
          difficulty: string;
          id?: string;
          is_public?: boolean;
          metadata?: { [key: string]: any };
          provider?: "native" | "hosted-web" | "webarena" | null;
          slug: string;
          title: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          current_revision_id?: string | null;
          description?: string;
          difficulty?: string;
          id?: string;
          is_public?: boolean;
          metadata?: { [key: string]: any };
          provider?: "native" | "hosted-web" | "webarena" | null;
          slug?: string;
          title?: string;
        };
        Relationships: [];
      };
      benchmark_case_revisions: {
        Row: {
          case_id: string;
          content_hash: string;
          created_at: string;
          id: string;
          manifest: Json;
          revision: string;
        };
        Insert: {
          case_id: string;
          content_hash: string;
          created_at?: string;
          id?: string;
          manifest: Json;
          revision: string;
        };
        Update: never;
        Relationships: [];
      };
      benchmark_attempt_scores: {
        Row: {
          attempt_id: string;
          breakdown: Json;
          created_at: string;
          id: string;
          run_id: string;
          score: number;
          status: "passed" | "failed" | "error";
          summary: string;
        };
        Insert: {
          attempt_id: string;
          breakdown?: Json;
          created_at?: string;
          id?: string;
          run_id: string;
          score: number;
          status: "passed" | "failed" | "error";
          summary: string;
        };
        Update: {
          attempt_id?: string;
          breakdown?: Json;
          created_at?: string;
          id?: string;
          run_id?: string;
          score?: number;
          status?: "passed" | "failed" | "error";
          summary?: string;
        };
        Relationships: [];
      };
      benchmark_attempts: {
        Row: {
          aggregate_score: number | null;
          case_revision_id: string | null;
          case_id: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          provider: string;
          run_id: string;
          scoring_summary: Json;
          started_at: string | null;
          status: "created" | "running" | "scoring" | "completed" | "failed" | "cancelled" | "timeout";
          suite_slug: string;
          suite_version: string;
        };
        Insert: {
          aggregate_score?: number | null;
          case_revision_id?: string | null;
          case_id: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          provider: string;
          run_id: string;
          scoring_summary?: Json;
          started_at?: string | null;
          status?: "created" | "running" | "scoring" | "completed" | "failed" | "cancelled" | "timeout";
          suite_slug: string;
          suite_version: string;
        };
        Update: {
          aggregate_score?: number | null;
          case_revision_id?: string | null;
          case_id?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          provider?: string;
          run_id?: string;
          scoring_summary?: Json;
          started_at?: string | null;
          status?: "created" | "running" | "scoring" | "completed" | "failed" | "cancelled" | "timeout";
          suite_slug?: string;
          suite_version?: string;
        };
        Relationships: [];
      };
      hosted_callback_outbox: {
        Row: {
          attempt_id: string;
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          event_type: "run_completion";
          id: string;
          last_error: string | null;
          locked_at: string | null;
          next_attempt_at: string;
          payload: Json;
          run_id: string;
          status: "pending" | "delivering" | "delivered" | "dead";
          updated_at: string;
        };
        Insert: {
          attempt_id: string;
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_type?: "run_completion";
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          next_attempt_at?: string;
          payload: Json;
          run_id: string;
          status?: "pending" | "delivering" | "delivered" | "dead";
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          delivered_at?: string | null;
          last_error?: string | null;
          locked_at?: string | null;
          next_attempt_at?: string;
          status?: "pending" | "delivering" | "delivered" | "dead";
          updated_at?: string;
        };
        Relationships: [];
      };
      orchestrator_command_dead_letters: {
        Row: {
          attempts: number;
          command_id: string;
          created_at: string;
          error_code: string;
          error_message: string;
          id: string;
          message_id: string;
          partition: number;
          partition_key: string | null;
          payload: Json;
          payload_type: string;
          replay_command_id: string | null;
          replayed_at: string | null;
          scrubbed_at: string | null;
          status: "dead" | "replayed" | "resolved";
          stream: string;
          updated_at: string;
        };
        Insert: {
          attempts: number;
          command_id: string;
          created_at?: string;
          error_code: string;
          error_message: string;
          id?: string;
          message_id: string;
          partition: number;
          partition_key?: string | null;
          payload?: Json;
          payload_type: string;
          replay_command_id?: string | null;
          replayed_at?: string | null;
          scrubbed_at?: string | null;
          status?: "dead" | "replayed" | "resolved";
          stream: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          error_code?: string;
          error_message?: string;
          replay_command_id?: string | null;
          replayed_at?: string | null;
          scrubbed_at?: string | null;
          status?: "dead" | "replayed" | "resolved";
          updated_at?: string;
        };
        Relationships: [];
      };
      benchmark_runs: {
        Row: {
          agent_name: string | null;
          agent_version: string | null;
          base_model: string | null;
          browser_environment: Json;
          case_id: string;
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          execution_mode: "internal" | "external-agent";
          guest_id: string | null;
          id: string;
          is_public: boolean;
          live_view_url: string | null;
          metadata: Json;
          runner_id: string | null;
          score: number | null;
          started_at: string | null;
          status:
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
          user_id: string | null;
        };
        Insert: {
          agent_name?: string | null;
          agent_version?: string | null;
          base_model?: string | null;
          browser_environment?: Json;
          case_id: string;
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          execution_mode: "internal" | "external-agent";
          guest_id?: string | null;
          id?: string;
          is_public?: boolean;
          live_view_url?: string | null;
          metadata?: Json;
          runner_id?: string | null;
          score?: number | null;
          started_at?: string | null;
          status?:
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
          user_id?: string | null;
        };
        Update: {
          agent_name?: string | null;
          agent_version?: string | null;
          base_model?: string | null;
          browser_environment?: Json;
          case_id?: string;
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          execution_mode?: "internal" | "external-agent";
          guest_id?: string | null;
          id?: string;
          is_public?: boolean;
          live_view_url?: string | null;
          metadata?: Json;
          runner_id?: string | null;
          score?: number | null;
          started_at?: string | null;
          status?:
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
          user_id?: string | null;
        };
        Relationships: [];
      };
      artifacts: {
        Row: {
          created_at: string;
          id: string;
          run_id: string;
          storage_path: string | null;
          type: string;
          url: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          run_id: string;
          storage_path?: string | null;
          type: string;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          run_id?: string;
          storage_path?: string | null;
          type?: string;
          url?: string | null;
        };
        Relationships: [];
      };
      hosted_web_access_logs: {
        Row: {
          attempt_id: string | null;
          created_at: string;
          event: string;
          id: string;
          ip: string | null;
          metadata: Json;
          referer: string | null;
          run_id: string | null;
          session_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          attempt_id?: string | null;
          created_at?: string;
          event: string;
          id?: string;
          ip?: string | null;
          metadata?: Json;
          referer?: string | null;
          run_id?: string | null;
          session_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          attempt_id?: string | null;
          created_at?: string;
          event?: string;
          id?: string;
          ip?: string | null;
          metadata?: Json;
          referer?: string | null;
          run_id?: string | null;
          session_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      hosted_web_events: {
        Row: {
          attempt_id: string | null;
          created_at: string;
          id: string;
          name: string | null;
          payload: Json;
          run_id: string;
          session_id: string;
          type: string;
        };
        Insert: {
          attempt_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          payload?: Json;
          run_id: string;
          session_id: string;
          type: string;
        };
        Update: {
          attempt_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string | null;
          payload?: Json;
          run_id?: string;
          session_id?: string;
          type?: string;
        };
        Relationships: [];
      };
      hosted_web_results: {
        Row: {
          app: string | null;
          attempt_id: string | null;
          created_at: string;
          evaluators: Json;
          final_state: Json;
          id: string;
          run_id: string;
          score: number;
          session_id: string;
          status: "passed" | "failed" | "error";
          summary: string;
          task_slug: string | null;
          weight: number;
        };
        Insert: {
          app?: string | null;
          attempt_id?: string | null;
          created_at?: string;
          evaluators?: Json;
          final_state?: Json;
          id?: string;
          run_id: string;
          score: number;
          session_id: string;
          status: "passed" | "failed" | "error";
          summary: string;
          task_slug?: string | null;
          weight?: number;
        };
        Update: {
          app?: string | null;
          attempt_id?: string | null;
          created_at?: string;
          evaluators?: Json;
          final_state?: Json;
          id?: string;
          run_id?: string;
          score?: number;
          session_id?: string;
          status?: "passed" | "failed" | "error";
          summary?: string;
          task_slug?: string | null;
          weight?: number;
        };
        Relationships: [];
      };
      hosted_web_sessions: {
        Row: {
          access_count: number;
          activated_at: string | null;
          app: string;
          attempt_id: string | null;
          case_id: string;
          completed_at: string | null;
          created_at: string;
          created_by_guest_id: string | null;
          created_by_user_id: string | null;
          expires_at: string | null;
          first_seen_ip: string | null;
          first_seen_user_agent: string | null;
          id: string;
          last_accessed_at: string | null;
          last_seen_ip: string | null;
          last_seen_user_agent: string | null;
          metadata: Json;
          provider: string;
          required: boolean;
          run_id: string;
          seed_version: string;
          sequence_index: number;
          session_token_hash: string;
          start_url: string;
          status: "created" | "active" | "scoring" | "completed" | "failed" | "expired";
          task_slug: string;
          task_version: string;
          weight: number;
        };
        Insert: {
          access_count?: number;
          activated_at?: string | null;
          app: string;
          attempt_id?: string | null;
          case_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by_guest_id?: string | null;
          created_by_user_id?: string | null;
          expires_at?: string | null;
          first_seen_ip?: string | null;
          first_seen_user_agent?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          last_seen_ip?: string | null;
          last_seen_user_agent?: string | null;
          metadata?: Json;
          provider?: string;
          required?: boolean;
          run_id: string;
          seed_version: string;
          sequence_index?: number;
          session_token_hash: string;
          start_url: string;
          status?: "created" | "active" | "scoring" | "completed" | "failed" | "expired";
          task_slug: string;
          task_version?: string;
          weight?: number;
        };
        Update: {
          access_count?: number;
          activated_at?: string | null;
          app?: string;
          attempt_id?: string | null;
          case_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by_guest_id?: string | null;
          created_by_user_id?: string | null;
          expires_at?: string | null;
          first_seen_ip?: string | null;
          first_seen_user_agent?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          last_seen_ip?: string | null;
          last_seen_user_agent?: string | null;
          metadata?: Json;
          provider?: string;
          required?: boolean;
          run_id?: string;
          seed_version?: string;
          sequence_index?: number;
          session_token_hash?: string;
          start_url?: string;
          status?: "created" | "active" | "scoring" | "completed" | "failed" | "expired";
          task_slug?: string;
          task_version?: string;
          weight?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          daily_run_limit: number | null;
          id: string;
        };
        Insert: {
          daily_run_limit?: number | null;
          id: string;
        };
        Update: {
          daily_run_limit?: number | null;
          id?: string;
        };
        Relationships: [];
      };
      run_events: {
        Row: {
          created_at: string;
          id: string;
          payload: { [key: string]: any };
          run_id: string;
          type:
            | "run.created"
            | "run.assigned"
            | "run.starting"
            | "run.running"
            | "agent.connected"
            | "live.frame"
            | "tool.call"
            | "tool.result"
            | "mcp.request"
            | "mcp.response"
            | "mcp.error"
            | "hosted.session.created"
            | "hosted.session.progress"
            | "hosted.page.load"
            | "hosted.action"
            | "hosted.task_signal"
            | "hosted.score"
            | "artifact.created"
            | "score.updated"
            | "run.completed"
            | "run.failed";
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload?: { [key: string]: any };
          run_id: string;
          type:
            | "run.created"
            | "run.assigned"
            | "run.starting"
            | "run.running"
            | "agent.connected"
            | "live.frame"
            | "tool.call"
            | "tool.result"
            | "mcp.request"
            | "mcp.response"
            | "mcp.error"
            | "hosted.session.created"
            | "hosted.session.progress"
            | "hosted.page.load"
            | "hosted.action"
            | "hosted.task_signal"
            | "hosted.score"
            | "artifact.created"
            | "score.updated"
            | "run.completed"
            | "run.failed";
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: { [key: string]: any };
          run_id?: string;
          type?:
            | "run.created"
            | "run.assigned"
            | "run.starting"
            | "run.running"
            | "agent.connected"
            | "live.frame"
            | "tool.call"
            | "tool.result"
            | "mcp.request"
            | "mcp.response"
            | "mcp.error"
            | "hosted.session.created"
            | "hosted.session.progress"
            | "hosted.page.load"
            | "hosted.action"
            | "hosted.task_signal"
            | "hosted.score"
            | "artifact.created"
            | "score.updated"
            | "run.completed"
            | "run.failed";
        };
        Relationships: [];
      };
    };
    Views: {
      public_benchmark_cases: {
        Row: {
          category: string | null;
          created_at: string | null;
          description: string | null;
          difficulty: string | null;
          id: string | null;
          metadata: Json | null;
          provider: "native" | "hosted-web" | "webarena" | null;
          slug: string | null;
          title: string | null;
        };
        Relationships: [];
      };
      public_hosted_run_summaries: {
        Row: {
          benchmark_title: string | null;
          case_id: string | null;
          observed_user_agent: string | null;
          run_id: string | null;
          suite_slug: string | null;
          suite_version: string | null;
        };
        Relationships: [];
      };
      public_hosted_run_consistency_checks: {
        Row: {
          failure_reason: string | null;
          name: string | null;
          required: boolean | null;
          run_id: string | null;
          score: number | null;
          sequence_index: number | null;
          source_task_slug: string | null;
          status: "passed" | "failed" | null;
          target_task_slug: string | null;
        };
        Relationships: [];
      };
      public_hosted_run_tasks: {
        Row: {
          app: string | null;
          created_at: string | null;
          run_id: string | null;
          score: number | null;
          status: "passed" | "failed" | "error" | null;
          summary: string | null;
          task_slug: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      complete_hosted_attempt_session: {
        Args: {
          p_attempt_id: string;
          p_attempt_update: Json;
          p_completed_at: string;
          p_result: Json;
          p_session_id: string;
        };
        Returns: Json;
      };
      claim_hosted_callback_outbox: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["hosted_callback_outbox"]["Row"][];
      };
      reconcile_hosted_callback_outbox: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      prune_orchestrator_command_dead_letters: {
        Args: {
          p_dead_before: string;
          p_limit?: number;
          p_resolved_before: string;
        };
        Returns: number;
      };
      scrub_orchestrator_command_dead_letters: {
        Args: { p_limit?: number };
        Returns: number;
      };
      timeout_hosted_attempt: {
        Args: {
          p_attempt_id: string;
          p_scoring_summary: Json;
          p_timed_out_session_id: string;
          p_timeout_at: string;
        };
        Returns: {
          attempt_run_id: string | null;
          expired_session_ids: string[];
          transitioned: boolean;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
