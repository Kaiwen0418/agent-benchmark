import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildHostedAttemptReadModel, type HostedAttemptReadModel } from "@agentbench/shared";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import { createAttemptHandlers } from "./attempt-handlers.js";
import {
  createAttemptLifecycle,
  type AttemptLifecycleAdvanceSession,
  type AttemptLifecycleSession,
  type HostedSessionStatus,
} from "./attempt-lifecycle.js";

const port = Number(process.env.HOSTED_ORCHESTRATOR_PORT ?? 3004);
const publicBaseUrl = process.env.HOSTED_ORCHESTRATOR_PUBLIC_URL ?? `http://localhost:${port}`;
const hostedSitesBaseUrl =
  process.env.HOSTED_SITES_URL ?? process.env.HOSTED_SITES_PUBLIC_URL ?? "http://localhost:3003";
const agentbenchWebUrl = process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000";
const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type PersistedSessionRow = {
  id: string;
  run_id: string | null;
  case_id: string | null;
  attempt_id: string | null;
  app: string;
  task_slug: string;
  task_version: string;
  sequence_index: number;
  weight: number;
  required: boolean;
  seed_version: string;
  status: string;
  metadata: Record<string, unknown> | null;
  start_url: string;
  expires_at: string | null;
  created_at: string;
};

type AttemptOverviewSession = HostedAttemptReadModel["sessions"][number] & {
  token: string;
  app: string;
  taskSlug: string;
  title: string | null;
  goal: string;
  startPath: string | null;
};

const pendingFinalStates = new Map<string, unknown>();
let supabaseAdmin: SupabaseClient | null | undefined;
let cleanupSweepInFlight = false;

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const cleanupSweepIntervalMs = envNumber("HOSTED_SESSION_SWEEP_INTERVAL_MS", 60_000);
const accessLogRetentionMs = envNumber("HOSTED_ACCESS_LOG_RETENTION_MS", 14 * 24 * 60 * 60 * 1000);

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenFromStartUrl(startUrl: string) {
  try {
    return new URL(startUrl).searchParams.get("session");
  } catch {
    return null;
  }
}

function getSupabaseAdmin() {
  if (supabaseAdmin !== undefined) {
    return supabaseAdmin;
  }

  supabaseAdmin =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null;

  return supabaseAdmin;
}

function defaultStartPathForApp(app: string) {
  if (app === "wiki-lite") {
    return "/wiki";
  }
  if (app === "forum-lite") {
    return "/forum";
  }
  if (app === "repo-lite") {
    return "/repo";
  }
  return "/shopping";
}

function defaultGoalForSession(app: string, taskSlug: string) {
  if (app === "wiki-lite" || taskSlug === "wiki-release-answer") {
    return "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the date exactly as written.";
  }
  if (app === "forum-lite" || taskSlug === "forum-battery-moderation") {
    return "Find the thread about battery swelling, reply with the official recall link from the policy post, then lock the thread with reason 'safety escalation'.";
  }
  if (app === "repo-lite" || taskSlug === "repo-readme-fix") {
    return 'Fix the README install command to use pnpm, then open a merge request titled "Fix install instructions" targeting main.';
  }

  return "Buy exactly one USB-C charger with total price at or below $30. Use standard shipping. Do not buy restricted products.";
}

function isInternalRunnerRequest(request: IncomingMessage) {
  if (!runnerSharedSecret) {
    return false;
  }

  const header = request.headers["x-runner-secret"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && value === runnerSharedSecret;
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function badRequest(response: ServerResponse, message: string) {
  sendJson(response, 400, { error: message });
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(request);
  if (body.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(body);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function extractMetadata(metadata: Record<string, unknown> | null) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function buildLifecycleSessionFromRow(row: PersistedSessionRow, token: string): AttemptLifecycleSession {
  const metadata = extractMetadata(row.metadata);
  return {
    id: row.id,
    token,
    runId: row.run_id,
    attemptId: row.attempt_id,
    app: row.app,
    taskSlug: row.task_slug,
    suiteSlug: typeof metadata.suiteSlug === "string" ? metadata.suiteSlug : row.task_slug,
    sequenceIndex: row.sequence_index,
    weight: row.weight,
    status:
      row.status === "created" ||
      row.status === "active" ||
      row.status === "completed" ||
      row.status === "failed" ||
      row.status === "expired"
        ? row.status
        : "created",
    startPath:
      typeof metadata.startPath === "string" ? metadata.startPath : defaultStartPathForApp(row.app),
    persisted: true,
  };
}

async function loadAttemptMetadata(attemptId: string | null) {
  if (!attemptId) {
    return {};
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {};
  }

  const { data } = await supabase.from("benchmark_attempts").select("metadata").eq("id", attemptId).maybeSingle();
  return extractMetadata(data?.metadata as Record<string, unknown> | null);
}

async function loadAttemptSessions(attemptId: string): Promise<AttemptLifecycleAdvanceSession[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select("id, app, task_slug, sequence_index, status, start_url")
    .eq("attempt_id", attemptId)
    .order("sequence_index", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    status:
      row.status === "created" ||
      row.status === "active" ||
      row.status === "completed" ||
      row.status === "failed" ||
      row.status === "expired"
        ? row.status
        : "created",
    sequenceIndex: row.sequence_index,
    token: tokenFromStartUrl(row.start_url) ?? makeId("missing"),
    startPath: (() => {
      try {
        return new URL(row.start_url).pathname;
      } catch {
        return defaultStartPathForApp(row.app);
      }
    })(),
    app: row.app,
  }));
}

async function loadAttemptReadModel(attemptId: string): Promise<HostedAttemptReadModel<AttemptOverviewSession>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return buildHostedAttemptReadModel({
      attemptId,
      metadata: {},
      sessions: [],
    });
  }

  const [metadata, sessions] = await Promise.all([
    loadAttemptMetadata(attemptId),
    supabase
      .from("hosted_web_sessions")
      .select("id, app, task_slug, sequence_index, status, start_url, metadata")
      .eq("attempt_id", attemptId)
      .order("sequence_index", { ascending: true }),
  ]);

  const rows = sessions.data ?? [];
  return buildHostedAttemptReadModel({
    attemptId,
    metadata,
    sessions: rows.map((row) => {
      const rowMetadata = extractMetadata(row.metadata as Record<string, unknown> | null);
      const token = tokenFromStartUrl(row.start_url) ?? makeId("missing");
      const startPath = (() => {
        try {
          return new URL(row.start_url).pathname;
        } catch {
          return defaultStartPathForApp(row.app);
        }
      })();

      return {
        id: row.id,
        token,
        app: row.app,
        taskSlug: row.task_slug,
        title: typeof rowMetadata.title === "string" ? rowMetadata.title : null,
        goal:
          typeof rowMetadata.goal === "string"
            ? rowMetadata.goal
            : defaultGoalForSession(row.app, row.task_slug),
        sequenceIndex: row.sequence_index,
        status:
          row.status === "created" ||
          row.status === "active" ||
          row.status === "completed" ||
          row.status === "failed" ||
          row.status === "expired"
            ? row.status
            : "created",
        startPath,
      };
    }),
  });
}

async function loadLatestSessionResult(sessionId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("hosted_web_results")
    .select("status, score, summary, evaluators")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    status: data.status,
    score: data.score,
    summary: data.summary,
    evaluators: Array.isArray(data.evaluators) ? data.evaluators : [],
  } as HostedWebScoreResult;
}

async function forwardRunEvent(session: AttemptLifecycleSession, type: string, payload: Record<string, unknown>) {
  if (!agentbenchWebUrl || !session.runId) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(runnerSharedSecret ? { "x-runner-secret": runnerSharedSecret } : {}),
    },
    body: JSON.stringify({
      type,
      payload,
    }),
  }).catch(() => undefined);
}

async function forwardCompletion(
  session: AttemptLifecycleSession,
  result: Pick<HostedWebScoreResult, "status" | "score" | "summary">,
) {
  if (!agentbenchWebUrl || !session.runId) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(runnerSharedSecret ? { "x-runner-secret": runnerSharedSecret } : {}),
    },
    body: JSON.stringify({
      status: result.status === "passed" ? "completed" : "failed",
      score: result.score,
      errorMessage: result.status === "passed" ? null : result.summary,
      artifacts: [],
    }),
  }).catch(() => undefined);
}

async function forwardTimeoutCompletion(params: {
  runId: string;
  summary: string;
  score?: number;
}) {
  if (!agentbenchWebUrl) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(params.runId)}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(runnerSharedSecret ? { "x-runner-secret": runnerSharedSecret } : {}),
    },
    body: JSON.stringify({
      status: "timeout",
      score: params.score ?? 0,
      errorMessage: params.summary,
      artifacts: [],
    }),
  }).catch(() => undefined);
}

async function persistScoreResult(session: AttemptLifecycleSession, result: HostedWebScoreResult) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !session.runId) {
    return;
  }

  const finalState = pendingFinalStates.get(session.id) ?? null;
  const { error } = await supabase.from("hosted_web_results").insert({
    session_id: session.id,
    run_id: session.runId,
    attempt_id: session.attemptId,
    app: session.app,
    task_slug: session.taskSlug,
    weight: session.weight,
    status: result.status,
    score: result.score,
    summary: result.summary,
    final_state: finalState,
    evaluators: result.evaluators,
  });

  if (error) {
    console.error("[hosted-orchestrator] failed to persist score result", error);
  }
}

async function initializeAttempt(params: {
  runId: string | null;
  caseId: string | null;
  callbackSecret: string | null;
  suiteSlug: string;
  suiteVersion: string;
  sessions: Array<{
    app: string;
    taskSlug: string;
    taskVersion: string;
    sequenceIndex: number;
    weight: number;
    required: boolean;
    title: string | null;
    goal: string | null;
    startPath: string | null;
    seedVersion: string | null;
    metadata: Record<string, unknown>;
  }>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !params.runId || !params.caseId) {
    throw new Error("Hosted attempt initialization requires database-backed run and case ids.");
  }

  const metadata = {
    sessions: params.sessions.map((session) => ({
      app: session.app,
      taskSlug: session.taskSlug,
      taskVersion: session.taskVersion,
      sequenceIndex: session.sequenceIndex,
      weight: session.weight,
      required: session.required,
      title: session.title,
      goal: session.goal,
      seedVersion: session.seedVersion,
      metadata: session.metadata,
    })),
    activeSessionId: null,
    activeSequenceIndex: 0,
    completedSessionIds: [],
  };

  const { data: attemptRow, error: attemptError } = await supabase
    .from("benchmark_attempts")
    .insert({
      run_id: params.runId,
      case_id: params.caseId,
      provider: "hosted-web",
      suite_slug: params.suiteSlug,
      suite_version: params.suiteVersion,
      status: "running",
      metadata,
      started_at: now(),
    })
    .select("id, suite_slug, suite_version, metadata")
    .single();

  if (attemptError || !attemptRow) {
    throw attemptError ?? new Error("Failed to create hosted attempt");
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();
  const orderedSessions = [...params.sessions].sort((left, right) => left.sequenceIndex - right.sequenceIndex);
  const rows = orderedSessions.map((session) => {
    const token = makeId("tok");
    const startPath = session.startPath ?? defaultStartPathForApp(session.app);
    const startUrl = `${hostedSitesBaseUrl}${startPath}?session=${encodeURIComponent(token)}`;
    const status: HostedSessionStatus = session.sequenceIndex > 0 ? "created" : "active";
    const sessionMetadata = {
      ...session.metadata,
      suiteSlug: params.suiteSlug,
      suiteVersion: params.suiteVersion,
      title: session.title,
      goal: session.goal ?? defaultGoalForSession(session.app, session.taskSlug),
      startPath,
    };

    return {
      run_id: params.runId,
      case_id: params.caseId,
      attempt_id: attemptRow.id,
      provider: "hosted-web",
      app: session.app,
      task_slug: session.taskSlug,
      task_version: session.taskVersion,
      sequence_index: session.sequenceIndex,
      weight: session.weight,
      required: session.required,
      seed_version: session.seedVersion ?? `${session.app}-v1`,
      start_url: startUrl,
      session_token_hash: hashToken(token),
      status,
      metadata: sessionMetadata,
      activated_at: now(),
      expires_at: expiresAt,
      token,
    };
  });

  const { data: createdRows, error: sessionError } = await supabase
    .from("hosted_web_sessions")
    .insert(
      rows.map(({ token, ...row }) => row),
    )
    .select(
      "id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, start_url, status, metadata",
    );

  if (sessionError || !createdRows) {
    throw sessionError ?? new Error("Failed to create hosted sessions");
  }

  const rowsByStartUrl = new Map(createdRows.map((row) => [row.start_url, row]));
  const sessions = rows
    .map((seed) => {
      const row = rowsByStartUrl.get(seed.start_url);
      if (!row) {
        return null;
      }
      const metadata = extractMetadata(row.metadata as Record<string, unknown> | null);
      return {
        sessionId: row.id,
        attemptId: row.attempt_id,
        token: seed.token,
        app: row.app,
        taskSlug: row.task_slug,
        taskVersion: row.task_version,
        sequenceIndex: row.sequence_index,
        weight: row.weight,
        required: row.required,
        startUrl: row.start_url,
        goal: typeof metadata.goal === "string" ? metadata.goal : defaultGoalForSession(row.app, row.task_slug),
        title: typeof metadata.title === "string" ? metadata.title : null,
        status: row.status,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex);

  const firstSession = sessions[0] ?? null;
  const mergedMetadata = {
    ...extractMetadata(attemptRow.metadata as Record<string, unknown> | null),
    activeSessionId: firstSession?.sessionId ?? null,
    activeSequenceIndex: firstSession?.sequenceIndex ?? null,
    completedSessionIds: [],
  };

  await supabase.from("benchmark_attempts").update({ metadata: mergedMetadata }).eq("id", attemptRow.id);

  return {
    attemptId: attemptRow.id,
    suiteSlug: attemptRow.suite_slug,
    suiteVersion: attemptRow.suite_version,
    metadata: mergedMetadata,
    sessions,
  };
}

async function loadSessionByToken(token: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select(
      "id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, start_url, expires_at, created_at",
    )
    .eq("session_token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PersistedSessionRow;
}

async function pruneExpiredAccessLogs() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return 0;
  }

  const cutoffIso = new Date(Date.now() - accessLogRetentionMs).toISOString();
  const { data, error } = await supabase
    .from("hosted_web_access_logs")
    .delete()
    .lt("created_at", cutoffIso)
    .select("id");

  if (error) {
    console.error("[hosted-orchestrator] failed to prune hosted access logs", error);
    return 0;
  }

  return data?.length ?? 0;
}

const attemptLifecycle = createAttemptLifecycle({
  now,
  getSupabaseAdmin,
  loadAttemptMetadata,
  loadAttemptSessions,
  loadAttemptReadModel,
  loadLatestSessionResult,
  persistScoreResult,
  forwardTimeoutCompletion,
  evictInMemorySessions: () => undefined,
});

const attemptHandlers = createAttemptHandlers<HostedAttemptReadModel<AttemptOverviewSession>>({
  initializeAttempt,
  completeSessionCommand: (session, result) =>
    attemptLifecycle.executeCompleteSessionCommand({
      type: "complete-session",
      session,
      result,
    }),
  resolveAdvanceCommand: (attemptId, currentSessionId) =>
    attemptLifecycle.executeResolveAdvanceCommand({
      type: "resolve-advance",
      attemptId,
      currentSessionId,
    }),
  timeoutAttemptCommand: ({ attemptId, runId, expiredSessionId, expiredTaskSlug }) =>
    attemptLifecycle.executeTimeoutAttemptCommand({
      type: "timeout-attempt",
      attemptId,
      runId,
      expiredSessionId,
      expiredTaskSlug,
    }),
  loadAttemptReadModel,
  forwardRunEvent,
  forwardCompletion,
  publicBaseUrl: hostedSitesBaseUrl,
  defaultStartPathForApp,
});

async function sweepExpiredSessions() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return 0;
  }

  const sweepStartedAt = now();
  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .update({
      status: "expired",
      completed_at: sweepStartedAt,
    })
    .lt("expires_at", sweepStartedAt)
    .in("status", ["created", "active", "scoring"])
    .select("id, attempt_id, run_id, task_slug, app");

  if (error) {
    console.error("[hosted-orchestrator] failed to sweep expired sessions", error);
    return 0;
  }

  const expiredRows = data ?? [];
  if (expiredRows.length === 0) {
    return 0;
  }

  const { error: accessLogError } = await supabase.from("hosted_web_access_logs").insert(
    expiredRows.map((row) => ({
      session_id: row.id,
      attempt_id: row.attempt_id,
      run_id: row.run_id,
      event: "session.expired_swept",
      metadata: {
        app: row.app,
        taskSlug: row.task_slug,
      },
    })),
  );

  if (accessLogError) {
    console.error("[hosted-orchestrator] failed to persist expiry sweep logs", accessLogError);
  }

  const attemptsToTimeout = new Map<string, { runId: string | null; sessionId: string; taskSlug: string }>();
  for (const row of expiredRows) {
    if (!row.attempt_id || attemptsToTimeout.has(row.attempt_id)) {
      continue;
    }
    attemptsToTimeout.set(row.attempt_id, {
      runId: row.run_id,
      sessionId: row.id,
      taskSlug: row.task_slug,
    });
  }

  for (const [attemptId, timeoutSeed] of attemptsToTimeout) {
    await attemptHandlers.handleTimeoutAttempt({
      attemptId,
      runId: timeoutSeed.runId,
      expiredSessionId: timeoutSeed.sessionId,
      expiredTaskSlug: timeoutSeed.taskSlug,
    });
  }

  return expiredRows.length;
}

async function runCleanupSweep(trigger: "startup" | "interval") {
  if (cleanupSweepInFlight) {
    return;
  }

  cleanupSweepInFlight = true;
  try {
    const expiredSessions = await sweepExpiredSessions();
    const prunedAccessLogs = await pruneExpiredAccessLogs();
    if (expiredSessions > 0 || prunedAccessLogs > 0) {
      console.log(
        `[hosted-orchestrator] cleanup(${trigger}) expired=${expiredSessions} access_logs=${prunedAccessLogs}`,
      );
    }
  } finally {
    cleanupSweepInFlight = false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!isInternalRunnerRequest(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/attempts/init") {
      const input = await readJson(request);
      const initialized = await attemptHandlers.handleInitializeAttempt({
        runId: typeof input.runId === "string" ? input.runId : null,
        caseId: typeof input.caseId === "string" ? input.caseId : null,
        callbackSecret: typeof input.callbackSecret === "string" ? input.callbackSecret : null,
        suiteSlug: typeof input.suiteSlug === "string" ? input.suiteSlug : "hosted-web-suite",
        suiteVersion: typeof input.suiteVersion === "string" ? input.suiteVersion : "v1",
        sessions: Array.isArray(input.sessions)
          ? input.sessions
              .filter((session): session is Record<string, unknown> => Boolean(session && typeof session === "object"))
              .map((session, index) => ({
                app: typeof session.app === "string" ? session.app : "shopping-lite",
                taskSlug: typeof session.taskSlug === "string" ? session.taskSlug : `hosted-task-${index + 1}`,
                taskVersion: typeof session.taskVersion === "string" ? session.taskVersion : "v1",
                sequenceIndex:
                  typeof session.sequenceIndex === "number" && Number.isFinite(session.sequenceIndex)
                    ? session.sequenceIndex
                    : index,
                weight: typeof session.weight === "number" ? session.weight : 1,
                required: typeof session.required === "boolean" ? session.required : true,
                title: typeof session.title === "string" ? session.title : null,
                goal: typeof session.goal === "string" ? session.goal : null,
                startPath: typeof session.startPath === "string" ? session.startPath : null,
                seedVersion: typeof session.seedVersion === "string" ? session.seedVersion : null,
                metadata:
                  session.metadata && typeof session.metadata === "object" && !Array.isArray(session.metadata)
                    ? (session.metadata as Record<string, unknown>)
                    : {},
              }))
          : [],
      });
      sendJson(response, initialized.statusCode, initialized.body);
      return;
    }

    const attemptStateMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/state$/);
    if (request.method === "GET" && attemptStateMatch) {
      const overview = await attemptHandlers.handleAttemptOverview({
        attemptId: decodeURIComponent(attemptStateMatch[1]),
      });
      sendJson(response, overview.statusCode, overview.body);
      return;
    }

    const resolveAdvanceMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/commands\/resolve-advance$/);
    if (request.method === "POST" && resolveAdvanceMatch) {
      const input = await readJson(request);
      const currentSessionId = typeof input.currentSessionId === "string" ? input.currentSessionId : null;
      if (!currentSessionId) {
        badRequest(response, "Missing currentSessionId");
        return;
      }

      const advance = await attemptHandlers.handleResolveAdvance({
        attemptId: decodeURIComponent(resolveAdvanceMatch[1]),
        currentSessionId,
      });
      sendJson(response, advance.statusCode, advance.body);
      return;
    }

    const completeMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/commands\/complete-session$/);
    if (request.method === "POST" && completeMatch) {
      const attemptId = decodeURIComponent(completeMatch[1]);
      const input = await readJson(request);
      const sessionToken = typeof input.sessionToken === "string" ? input.sessionToken : null;
      if (!sessionToken) {
        badRequest(response, "Missing sessionToken");
        return;
      }

      const sessionRow = await loadSessionByToken(sessionToken);
      if (!sessionRow || sessionRow.attempt_id !== attemptId) {
        sendJson(response, 404, { error: "Unknown session" });
        return;
      }

      const resultInput =
        input.result && typeof input.result === "object" && !Array.isArray(input.result)
          ? (input.result as Record<string, unknown>)
          : null;
      if (!resultInput) {
        badRequest(response, "Missing result");
        return;
      }

      const result: HostedWebScoreResult = {
        status:
          resultInput.status === "passed" || resultInput.status === "failed" || resultInput.status === "error"
            ? resultInput.status
            : "error",
        score: typeof resultInput.score === "number" ? resultInput.score : 0,
        summary: typeof resultInput.summary === "string" ? resultInput.summary : "Hosted session completed.",
        evaluators: Array.isArray(resultInput.evaluators) ? resultInput.evaluators : [],
      };

      pendingFinalStates.set(sessionRow.id, input.finalState ?? null);
      try {
        const completion = await attemptHandlers.handleCompleteSession({
          session: buildLifecycleSessionFromRow(sessionRow, sessionToken),
          result,
        });
        sendJson(response, completion.statusCode, completion.body);
      } finally {
        pendingFinalStates.delete(sessionRow.id);
      }
      return;
    }

    const timeoutMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/commands\/timeout$/);
    if (request.method === "POST" && timeoutMatch) {
      const input = await readJson(request);
      const expiredSessionId = typeof input.expiredSessionId === "string" ? input.expiredSessionId : null;
      const expiredTaskSlug = typeof input.expiredTaskSlug === "string" ? input.expiredTaskSlug : null;
      if (!expiredSessionId || !expiredTaskSlug) {
        badRequest(response, "Missing expiredSessionId or expiredTaskSlug");
        return;
      }

      const timeout = await attemptHandlers.handleTimeoutAttempt({
        attemptId: decodeURIComponent(timeoutMatch[1]),
        runId: typeof input.runId === "string" ? input.runId : null,
        expiredSessionId,
        expiredTaskSlug,
      });
      sendJson(response, timeout.statusCode, timeout.body);
      return;
    }

    sendJson(response, 404, { error: "Not Found" });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

server.listen(port, () => {
  console.log(`[hosted-orchestrator] listening on ${publicBaseUrl}`);
});

void runCleanupSweep("startup");
setInterval(() => {
  void runCleanupSweep("interval");
}, cleanupSweepIntervalMs);
