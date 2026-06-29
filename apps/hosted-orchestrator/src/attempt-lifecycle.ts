import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, HostedAttemptReadModel, HostedAttemptSessionStatus } from "@agentbench/shared";
import {
  aggregateSuiteScore,
  evaluateSuiteConsistency,
  hostedWebScoreResultSchema,
  hostedWebSuiteScoreResultSchema,
  suiteConsistencyCheckSchema,
  type HostedWebScoreResult,
  type HostedWebSuiteScoreResult,
  type HostedWebSuiteSessionScore,
  type SuiteConsistencyCheck,
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

type AttemptLifecycleDeps = {
  now: () => string;
  getSupabaseAdmin: () => SupabaseClient<Database> | null | undefined;
  loadAttemptMetadata: (attemptId: string | null) => Promise<Record<string, unknown>>;
  loadAttemptSessions: (attemptId: string) => Promise<AttemptLifecycleAdvanceSession[]>;
  loadAttemptReadModel: (attemptId: string) => Promise<HostedAttemptReadModel<AttemptLifecycleAdvanceSession>>;
  loadLatestSessionResult: (sessionId: string) => Promise<HostedWebScoreResult | null>;
  forwardTimeoutCompletion: (params: { runId: string; summary: string; score?: number }) => Promise<void>;
  evictInMemorySessions: (sessionIds: string[]) => void;
};

const terminalAttemptStatuses = new Set<AttemptStatus>(["completed", "failed", "cancelled", "timeout"]);

// Cross-app consistency checks are published in the service-role manifest and
// copied onto attempt metadata at initialization. Re-parse defensively with the
// scoring schema so malformed/legacy metadata simply yields no checks.
function readConsistencyChecks(metadata: Record<string, unknown>): SuiteConsistencyCheck[] {
  const raw = metadata.consistencyChecks;
  if (!Array.isArray(raw)) {
    return [];
  }
  const checks: SuiteConsistencyCheck[] = [];
  for (const candidate of raw) {
    const parsed = suiteConsistencyCheckSchema.safeParse(candidate);
    if (parsed.success) {
      checks.push(parsed.data);
    }
  }
  return checks;
}

export function createAttemptLifecycle(deps: AttemptLifecycleDeps) {
  async function completePersistedSession(session: AttemptLifecycleSession, result: HostedWebScoreResult): Promise<{
    result: HostedWebScoreResult;
    duplicate: boolean;
    complete: boolean;
    aggregate: HostedWebSuiteScoreResult | null;
  }> {
    const supabase = deps.getSupabaseAdmin();
    if (!supabase || !session.runId || !session.attemptId) {
      throw new Error("Persisted session completion requires database-backed run and attempt ids.");
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
      .select("session_id, app, task_slug, score, status, weight, final_state")
      .eq("attempt_id", session.attemptId)
      .order("created_at", { ascending: true });

    if (resultsError || !resultRows) {
      throw resultsError ?? new Error(`Attempt ${session.attemptId} results are unavailable.`);
    }

    const { data: sessionRows, error: sessionsError } = await supabase
      .from("hosted_web_sessions")
      .select("id, app, task_slug, weight, required, sequence_index")
      .eq("attempt_id", session.attemptId)
      .order("sequence_index", { ascending: true });

    if (sessionsError || !sessionRows) {
      throw sessionsError ?? new Error(`Attempt ${session.attemptId} sessions are unavailable.`);
    }

    const latestResultBySessionId = new Map<string, HostedWebSuiteSessionScore>();
    for (const row of resultRows) {
      latestResultBySessionId.set(row.session_id, {
        sessionId: row.session_id,
        app: row.app ?? "unknown",
        taskSlug: row.task_slug ?? "unknown",
        score: row.score,
        status: row.status,
        weight: row.weight,
        required: true,
      });
    }
    latestResultBySessionId.set(session.id, {
      sessionId: session.id,
      app: session.app,
      taskSlug: session.taskSlug,
      score: result.score,
      status: result.status,
      weight: session.weight,
      required: sessionRows.find((row) => row.id === session.id)?.required ?? true,
    });

    const completedSessionIds = new Set(latestResultBySessionId.keys());

    // Map each session's agent-produced final state by task slug for suite-level
    // consistency checks. The just-completed session's final state has not been
    // persisted yet, so source it from the in-memory session.
    const finalStateByTaskSlug = new Map<string, unknown>();
    for (const row of resultRows) {
      if (row.task_slug) {
        finalStateByTaskSlug.set(row.task_slug, row.final_state ?? null);
      }
    }
    finalStateByTaskSlug.set(session.taskSlug, session.finalState ?? null);

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

    let aggregate: HostedWebSuiteScoreResult | null = null;
    let attemptStatus: AttemptStatus = "running";
    let scoringSummary: Record<string, unknown>;
    let metadata: Record<string, unknown>;
    if (pendingSessionIds.length > 0) {
      const completedIds = sessionRows
        .filter((row) => completedSessionIds.has(row.id))
        .map((row) => row.id);
      metadata = {
        ...existingAttemptMetadata,
        activeSessionId: nextPendingSession?.id ?? null,
        activeSequenceIndex: nextPendingSession?.sequence_index ?? null,
        completedSessionIds: completedIds,
      };
      scoringSummary = {
        summary: `Completed ${completedSessionIds.size} of ${sessionRows.length} hosted sessions.`,
        status: "running",
        breakdown: {
          aggregation: "weighted-required-suite",
          sessions: suiteSessions,
          pendingSessionIds,
        },
      };
    } else {
      const consistencyChecks = readConsistencyChecks(existingAttemptMetadata);
      const consistency =
        consistencyChecks.length > 0
          ? evaluateSuiteConsistency(consistencyChecks, finalStateByTaskSlug)
          : [];
      aggregate = aggregateSuiteScore({
        sessions: suiteSessions,
        consistency,
        passSummary: `All required hosted sessions for ${session.suiteSlug} passed.`,
        failSummary: `One or more required hosted sessions for ${session.suiteSlug} failed.`,
      });
      attemptStatus = aggregate.status === "passed" ? "completed" : "failed";
      metadata = {
        ...existingAttemptMetadata,
        activeSessionId: null,
        activeSequenceIndex: null,
        completedSessionIds: sessionRows.map((row) => row.id),
      };
      scoringSummary = {
        summary: aggregate.summary,
        status: aggregate.status,
        breakdown: aggregate.breakdown,
      };
    }

    const { data: transition, error: transitionError } = await supabase.rpc("complete_hosted_attempt_session", {
      p_attempt_id: session.attemptId,
      p_session_id: session.id,
      p_completed_at: deps.now(),
      p_result: {
        ...result,
        finalState: session.finalState ?? null,
      },
      p_attempt_update: {
        complete: aggregate !== null,
        status: attemptStatus,
        aggregate,
        metadata,
        scoringSummary,
        nextSessionId: nextPendingSession?.id ?? null,
      },
    });
    if (transitionError) {
      throw transitionError;
    }

    const payload = transition && typeof transition === "object" && !Array.isArray(transition)
      ? transition as Record<string, unknown>
      : null;
    if (!payload || (!payload.transitioned && !payload.duplicate)) {
      throw new Error(`Session completion conflict: ${String(payload?.conflict ?? "invalid_response")}.`);
    }
    const persistedResult = hostedWebScoreResultSchema.parse(payload.result);
    const persistedAggregate = payload.aggregate === null || payload.aggregate === undefined
      ? null
      : hostedWebSuiteScoreResultSchema.parse(payload.aggregate);
    return {
      result: persistedResult,
      duplicate: payload.duplicate === true,
      complete: payload.complete === true,
      aggregate: persistedAggregate,
    };
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

    const persisted = session.persisted
      ? await completePersistedSession(session, result)
      : {
          result,
          duplicate: false,
          complete: false,
          aggregate: null,
        };
    session.status = persisted.result.status === "passed" ? "completed" : "failed";

    return {
      result: persisted.result,
      attemptResult: { complete: persisted.complete, aggregate: persisted.aggregate },
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
