import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, HostedAttemptReadModel, HostedAttemptSessionStatus } from "@agentbench/shared";
import {
  aggregateSuiteScore,
  hostedWebSuiteScoreResultSchema,
  type HostedWebScoreResult,
  type HostedWebSuiteScoreResult,
  type HostedWebSuiteSessionScore,
} from "@agentbench/scoring";

export type AttemptStatus = "created" | "running" | "scoring" | "completed" | "failed" | "cancelled" | "timeout";
export type HostedSessionStatus = HostedAttemptSessionStatus;

export type AttemptLifecycleSession = {
  id: string;
  token: string;
  runId: string | null;
  attemptId: string | null;
  app: string;
  taskSlug: string;
  suiteSlug: string;
  sequenceIndex: number;
  weight: number;
  status: HostedSessionStatus;
  startPath: string | null;
  persisted: boolean;
  finalState?: unknown;
};

export type AttemptLifecycleAdvanceSession = {
  id: string;
  status: HostedSessionStatus;
  sequenceIndex: number;
  token: string;
  startPath: string | null;
  app: string;
};

export type CompleteSessionCommand = {
  type: "complete-session";
  session: AttemptLifecycleSession;
  result: HostedWebScoreResult;
};

export type ResolveAdvanceCommand = {
  type: "resolve-advance";
  attemptId: string;
  currentSessionId: string;
};

export type TimeoutAttemptCommand = {
  type: "timeout-attempt";
  attemptId: string;
  runId: string | null;
  expiredSessionId: string;
  expiredTaskSlug: string;
};

export type CompleteSessionCommandResult = {
  command: "complete-session";
  ok: true;
  attemptId: string | null;
  duplicate: boolean;
  result: HostedWebScoreResult;
  attemptResult: {
    complete: boolean;
    aggregate: HostedWebSuiteScoreResult | null;
  };
};

export type ResolveAdvanceCommandResult = {
  command: "resolve-advance";
  ok: boolean;
  attemptId: string;
  currentSessionId: string;
  complete: boolean;
  nextSession: AttemptLifecycleAdvanceSession | null;
};

export type TimeoutAttemptCommandResult = {
  command: "timeout-attempt";
  ok: boolean;
  attemptId: string;
  runId: string | null;
  summary: string | null;
};

export type PersistScoreResultOutcome = {
  result: HostedWebScoreResult;
  duplicate: boolean;
};

type AttemptLifecycleDeps = {
  now: () => string;
  getSupabaseAdmin: () => SupabaseClient<Database> | null | undefined;
  loadAttemptMetadata: (attemptId: string | null) => Promise<Record<string, unknown>>;
  loadAttemptSessions: (attemptId: string) => Promise<AttemptLifecycleAdvanceSession[]>;
  loadAttemptReadModel: (attemptId: string) => Promise<HostedAttemptReadModel<AttemptLifecycleAdvanceSession>>;
  loadLatestSessionResult: (sessionId: string) => Promise<HostedWebScoreResult | null>;
  persistScoreResult: (
    session: AttemptLifecycleSession,
    result: HostedWebScoreResult,
  ) => Promise<PersistScoreResultOutcome>;
  forwardTimeoutCompletion: (params: { runId: string; summary: string; score?: number }) => Promise<void>;
  evictInMemorySessions: (sessionIds: string[]) => void;
};

const terminalAttemptStatuses = new Set<AttemptStatus>(["completed", "failed", "cancelled", "timeout"]);

export function createAttemptLifecycle(deps: AttemptLifecycleDeps) {
  async function persistAttemptScore(session: AttemptLifecycleSession, result: HostedWebScoreResult): Promise<{
    complete: boolean;
    aggregate: HostedWebSuiteScoreResult | null;
  }> {
    if (!session.persisted || !session.runId || !session.attemptId) {
      return { complete: false, aggregate: null };
    }

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return { complete: false, aggregate: null };
    }

    const { data: attemptRow } = await supabase
      .from("benchmark_attempts")
      .select("metadata")
      .eq("id", session.attemptId)
      .maybeSingle();
    const existingAttemptMetadata =
      attemptRow?.metadata && typeof attemptRow.metadata === "object" && !Array.isArray(attemptRow.metadata)
        ? (attemptRow.metadata as Record<string, unknown>)
        : {};

    const { data: resultRows, error: resultsError } = await supabase
      .from("hosted_web_results")
      .select("session_id, app, task_slug, score, status, weight")
      .eq("attempt_id", session.attemptId)
      .order("created_at", { ascending: true });

    if (resultsError || !resultRows) {
      console.error("[hosted-orchestrator] failed to load attempt results for aggregation", resultsError);
      return { complete: false, aggregate: null };
    }

    const { data: sessionRows, error: sessionsError } = await supabase
      .from("hosted_web_sessions")
      .select("id, app, task_slug, weight, required, sequence_index")
      .eq("attempt_id", session.attemptId)
      .order("sequence_index", { ascending: true });

    if (sessionsError || !sessionRows) {
      console.error("[hosted-orchestrator] failed to load attempt sessions for aggregation", sessionsError);
      return { complete: false, aggregate: null };
    }

    const latestResultBySessionId = new Map<string, (typeof resultRows)[number]>();
    for (const row of resultRows) {
      latestResultBySessionId.set(row.session_id, row);
    }

    const completedSessionIds = new Set(latestResultBySessionId.keys());

    const suiteSessions: HostedWebSuiteSessionScore[] = sessionRows.map((row) => {
      const latestResult = latestResultBySessionId.get(row.id);
      return {
        sessionId: row.id,
        app: row.app,
        taskSlug: row.task_slug,
        score: latestResult?.score ?? 0,
        status: latestResult?.status ?? "failed",
        weight: row.weight,
        required: row.required,
      };
    });

    const pendingSessionIds = sessionRows
      .filter((row) => !completedSessionIds.has(row.id))
      .map((row) => row.id);
    const nextPendingSession =
      sessionRows.find((row) => !completedSessionIds.has(row.id) && row.id !== session.id) ??
      sessionRows.find((row) => !completedSessionIds.has(row.id));

    const { error: sessionError } = await supabase
      .from("hosted_web_sessions")
      .update({
        status: result.status === "passed" ? "completed" : "failed",
        completed_at: deps.now(),
      })
      .eq("id", session.id);

    if (sessionError) {
      console.error("[hosted-orchestrator] failed to update hosted session status", sessionError);
    }

    if (pendingSessionIds.length > 0) {
      const completedIds = sessionRows
        .filter((row) => completedSessionIds.has(row.id))
        .map((row) => row.id);
      const { error: attemptProgressError } = await supabase
        .from("benchmark_attempts")
        .update({
          status: "running",
          metadata: {
            ...existingAttemptMetadata,
            activeSessionId: nextPendingSession?.id ?? null,
            activeSequenceIndex: nextPendingSession?.sequence_index ?? null,
            completedSessionIds: completedIds,
          },
          scoring_summary: {
            summary: `Completed ${completedSessionIds.size} of ${sessionRows.length} hosted sessions.`,
            status: "running",
            breakdown: {
              aggregation: "weighted-required-suite",
              sessions: suiteSessions,
              pendingSessionIds,
            },
          },
        })
        .eq("id", session.attemptId);

      if (attemptProgressError) {
        console.error("[hosted-orchestrator] failed to update attempt progress", attemptProgressError);
      }

      return { complete: false, aggregate: null };
    }

    const aggregate = aggregateSuiteScore({
      sessions: suiteSessions,
      passSummary: `All required hosted sessions for ${session.suiteSlug} passed.`,
      failSummary: `One or more required hosted sessions for ${session.suiteSlug} failed.`,
    });
    const breakdown = aggregate.breakdown;
    const completedAt = deps.now();

    const { error: scoreError } = await supabase.from("benchmark_attempt_scores").insert({
      run_id: session.runId,
      attempt_id: session.attemptId,
      status: aggregate.status,
      score: aggregate.score,
      summary: aggregate.summary,
      breakdown,
    });

    let persistedAggregate = aggregate;
    if (scoreError?.code === "23505") {
      const { data: existingScore, error: existingScoreError } = await supabase
        .from("benchmark_attempt_scores")
        .select("status, score, summary, breakdown")
        .eq("attempt_id", session.attemptId)
        .maybeSingle();

      if (existingScoreError) {
        throw existingScoreError;
      }

      const parsedExistingScore = hostedWebSuiteScoreResultSchema.safeParse(existingScore);
      if (!parsedExistingScore.success) {
        throw new Error(`Attempt ${session.attemptId} has an invalid persisted aggregate score.`);
      }
      persistedAggregate = parsedExistingScore.data;
    } else if (scoreError) {
      throw scoreError;
    }

    const persistedBreakdown = persistedAggregate.breakdown;
    const persistedStatus = persistedAggregate.status === "passed" ? "completed" : "failed";

    const { error: attemptError } = await supabase
      .from("benchmark_attempts")
      .update({
        status: persistedStatus,
        aggregate_score: persistedAggregate.score,
        metadata: {
          ...existingAttemptMetadata,
          activeSessionId: null,
          activeSequenceIndex: null,
          completedSessionIds: sessionRows.map((row) => row.id),
        },
        scoring_summary: {
          summary: persistedAggregate.summary,
          status: persistedAggregate.status,
          breakdown: persistedBreakdown,
        },
        completed_at: completedAt,
      })
      .eq("id", session.attemptId);

    if (attemptError) {
      console.error("[hosted-orchestrator] failed to update attempt", attemptError);
    }

    return { complete: true, aggregate: persistedAggregate };
  }

  async function promoteNextAttemptSession(attemptId: string, completedSessionId: string) {
    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return;
    }

    const metadata = await deps.loadAttemptMetadata(attemptId);
    const completedSessionIds = Array.isArray(metadata.completedSessionIds)
      ? metadata.completedSessionIds.filter((value): value is string => typeof value === "string")
      : [];
    const nextSessions = await deps.loadAttemptSessions(attemptId);
    const nextActive = nextSessions.find(
      (candidate) => !completedSessionIds.includes(candidate.id) && candidate.id !== completedSessionId,
    );

    if (nextActive && nextActive.status === "created") {
      nextActive.status = "active";
      await supabase
        .from("hosted_web_sessions")
        .update({ status: "active" })
        .eq("id", nextActive.id);
    }
  }

  async function finalizeSession(session: AttemptLifecycleSession, result: HostedWebScoreResult) {
    if (session.status === "completed" || session.status === "failed") {
      const existingResult = await deps.loadLatestSessionResult(session.id);
      return {
        result: existingResult ?? result,
        attemptResult: { complete: false, aggregate: null as HostedWebSuiteScoreResult | null },
        duplicate: true,
      };
    }

    if (session.attemptId) {
      const metadata = await deps.loadAttemptMetadata(session.attemptId);
      const activeSessionId = typeof metadata.activeSessionId === "string" ? metadata.activeSessionId : null;
      if (activeSessionId && activeSessionId !== session.id) {
        throw new Error(`Session ${session.id} is not the active session for attempt ${session.attemptId}.`);
      }
    }

    const persisted = await deps.persistScoreResult(session, result);
    session.status = persisted.result.status === "passed" ? "completed" : "failed";
    const attemptResult = await persistAttemptScore(session, persisted.result);

    if (!attemptResult.complete && session.attemptId) {
      await promoteNextAttemptSession(session.attemptId, session.id);
    }

    return {
      result: persisted.result,
      attemptResult,
      duplicate: persisted.duplicate,
    };
  }

  async function executeCompleteSessionCommand(command: CompleteSessionCommand) {
    const finalization = await finalizeSession(command.session, command.result);
    return {
      command: "complete-session",
      ok: true,
      attemptId: command.session.attemptId,
      duplicate: finalization.duplicate,
      result: finalization.result,
      attemptResult: finalization.attemptResult,
    } satisfies CompleteSessionCommandResult;
  }

  async function timeoutAttemptFromExpiredSession(params: {
    attemptId: string;
    runId: string | null;
    expiredSessionId: string;
    expiredTaskSlug: string;
  }) {
    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return {
        command: "timeout-attempt",
        ok: false,
        attemptId: params.attemptId,
        runId: params.runId,
        summary: null,
      } satisfies TimeoutAttemptCommandResult;
    }

    const { data: attemptRow, error: attemptError } = await supabase
      .from("benchmark_attempts")
      .select("status, suite_slug, metadata")
      .eq("id", params.attemptId)
      .maybeSingle();

    if (attemptError || !attemptRow) {
      if (attemptError) {
        console.error("[hosted-orchestrator] failed to load attempt for timeout", attemptError);
      }
      return {
        command: "timeout-attempt",
        ok: false,
        attemptId: params.attemptId,
        runId: params.runId,
        summary: null,
      } satisfies TimeoutAttemptCommandResult;
    }

    if (terminalAttemptStatuses.has(attemptRow.status as AttemptStatus)) {
      return {
        command: "timeout-attempt",
        ok: false,
        attemptId: params.attemptId,
        runId: params.runId,
        summary: null,
      } satisfies TimeoutAttemptCommandResult;
    }

    const { data: sessionRows, error: sessionsError } = await supabase
      .from("hosted_web_sessions")
      .select("id, run_id, app, task_slug, sequence_index, status")
      .eq("attempt_id", params.attemptId)
      .order("sequence_index", { ascending: true });

    if (sessionsError || !sessionRows) {
      console.error("[hosted-orchestrator] failed to load attempt sessions for timeout", sessionsError);
      return {
        command: "timeout-attempt",
        ok: false,
        attemptId: params.attemptId,
        runId: params.runId,
        summary: null,
      } satisfies TimeoutAttemptCommandResult;
    }

    const timeoutAt = deps.now();
    const siblingSessionIds = sessionRows
      .filter((row) => row.status === "created" || row.status === "active" || row.status === "scoring")
      .map((row) => row.id);

    const summary = `Hosted suite timed out after session ${params.expiredTaskSlug} expired before completion.`;
    const scoringSummary = {
      summary,
      status: "timeout",
      breakdown: {
        aggregation: "timeout",
        timedOutSessionId: params.expiredSessionId,
        timedOutSessionIds: siblingSessionIds,
        sessions: sessionRows.map((row) => ({
          sessionId: row.id,
          app: row.app,
          taskSlug: row.task_slug,
          sequenceIndex: row.sequence_index,
          status: siblingSessionIds.includes(row.id) ? "expired" : row.status,
        })),
      },
    };

    const { data: timeoutTransition, error: timeoutError } = await supabase
      .rpc("timeout_hosted_attempt", {
        p_attempt_id: params.attemptId,
        p_timeout_at: timeoutAt,
        p_timed_out_session_id: params.expiredSessionId,
        p_scoring_summary: scoringSummary,
      })
      .maybeSingle();

    if (timeoutError || !timeoutTransition?.transitioned) {
      if (timeoutError) {
        console.error("[hosted-orchestrator] failed to atomically time out attempt", timeoutError);
      }
      return {
        command: "timeout-attempt",
        ok: false,
        attemptId: params.attemptId,
        runId: params.runId,
        summary,
      } satisfies TimeoutAttemptCommandResult;
    }

    const expiredSessionIds = timeoutTransition.expired_session_ids ?? siblingSessionIds;
    deps.evictInMemorySessions(expiredSessionIds);

    const runId = timeoutTransition.attempt_run_id ?? params.runId;
    if (runId) {
      await deps.forwardTimeoutCompletion({
        runId,
        summary,
        score: 0,
      });
    }

    return {
      command: "timeout-attempt",
      ok: true,
      attemptId: params.attemptId,
      runId,
      summary,
    } satisfies TimeoutAttemptCommandResult;
  }

  async function executeTimeoutAttemptCommand(command: TimeoutAttemptCommand) {
    return timeoutAttemptFromExpiredSession({
      attemptId: command.attemptId,
      runId: command.runId,
      expiredSessionId: command.expiredSessionId,
      expiredTaskSlug: command.expiredTaskSlug,
    });
  }

  async function resolveAdvance(attemptId: string, currentSessionId: string) {
    const readModel = await deps.loadAttemptReadModel(attemptId);
    if (!readModel.sessions.some((candidate) => candidate.id === currentSessionId)) {
      return {
        valid: false as const,
        complete: false,
        nextSession: null,
      };
    }

    return {
      valid: true as const,
      complete: readModel.activeSessionId === null,
      nextSession:
        readModel.activeSessionId === null
          ? null
          : readModel.sessions.find((candidate) => candidate.id === readModel.activeSessionId) ?? null,
    };
  }

  async function executeResolveAdvanceCommand(command: ResolveAdvanceCommand) {
    const resolved = await resolveAdvance(command.attemptId, command.currentSessionId);
    return {
      command: "resolve-advance",
      ok: resolved.valid,
      attemptId: command.attemptId,
      currentSessionId: command.currentSessionId,
      complete: resolved.complete,
      nextSession: resolved.nextSession,
    } satisfies ResolveAdvanceCommandResult;
  }

  return {
    executeCompleteSessionCommand,
    executeResolveAdvanceCommand,
    executeTimeoutAttemptCommand,
    finalizeSession,
    resolveAdvance,
    timeoutAttemptFromExpiredSession,
  };
}
