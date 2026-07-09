import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createRedisClient, type RedisClientType } from "redis";
import {
  buildHostedAttemptReadModel,
  createHostedViewerToken,
  type Database,
  type HostedAttemptReadModel,
  type HostedWebSessionMetadata,
} from "@agentbench/shared";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import { hostedAttemptConnectionSnapshotSchema } from "@agentbench/protocol";
import { createAttemptHandlers } from "./attempt-handlers.js";
import { resolveHostedSitesUrls } from "./service-urls.js";
import {
  createCommandBackbone,
  type CommandBackboneRole,
  type CommandDeadLetter,
} from "./command-backbone.js";
import {
  createAttemptLifecycle,
  type AttemptLifecycleAdvanceSession,
  type AttemptLifecycleSession,
  type HostedSessionStatus,
} from "./attempt-lifecycle.js";
import { generateAttemptQuestions } from "./question-generation.js";
import { createIdempotentInitializer } from "./idempotent-initializer.js";
import { createSingleFlight } from "./single-flight.js";
import { createCallbackOutboxProcessor } from "./callback-outbox.js";
import { resolveBenchmarkCaseRevision } from "./case-revisions.js";
import {
  pruneCommandDeadLetters,
  redactCommandErrorMessage,
  redactCommandPayload,
  scrubCommandDeadLetters,
} from "./command-dead-letter.js";
import {
  invalidateRunSessionProjectionCache,
  readRunSessionProjectionCache,
  writeRunSessionProjectionCache,
  type ProjectionCacheRedis,
  type RunSessionProjection,
} from "./run-session-projection-cache.js";

const port = Number(process.env.HOSTED_ORCHESTRATOR_PORT ?? 3004);
const publicBaseUrl = process.env.HOSTED_ORCHESTRATOR_PUBLIC_URL ?? `http://localhost:${port}`;
const { publicBaseUrl: hostedSitesPublicBaseUrl } = resolveHostedSitesUrls(process.env);
const agentbenchWebUrl = process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000";
const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET;
const viewerTokenSecret = process.env.HOSTED_VIEWER_SECRET ?? runnerSharedSecret;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orchestratorRedisUrl = process.env.ORCHESTRATOR_REDIS_URL;
const orchestratorMode = (process.env.ORCHESTRATOR_MODE ?? "all") as CommandBackboneRole;
const orchestratorPartitionCount = Math.trunc(envNumber("ORCHESTRATOR_PARTITION_COUNT", 16));

function parseWorkerPartitions(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return [...new Set(value.split(",").map((item) => Number(item.trim())))];
}

const workerPartitions = parseWorkerPartitions(process.env.ORCHESTRATOR_WORKER_PARTITIONS);

if (orchestratorMode !== "api" && orchestratorMode !== "worker" && orchestratorMode !== "all") {
  throw new Error("ORCHESTRATOR_MODE must be api, worker, or all.");
}
if (orchestratorMode === "worker" && !workerPartitions) {
  throw new Error("ORCHESTRATOR_WORKER_PARTITIONS is required in worker mode.");
}

type PersistedSessionRow = Pick<
  Database["public"]["Tables"]["hosted_web_sessions"]["Row"],
  | "id"
  | "run_id"
  | "case_id"
  | "attempt_id"
  | "app"
  | "task_slug"
  | "task_version"
  | "sequence_index"
  | "weight"
  | "required"
  | "seed_version"
  | "status"
  | "metadata"
  | "start_url"
  | "expires_at"
  | "created_at"
  | "access_count"
  | "last_accessed_at"
  | "first_seen_ip"
  | "last_seen_ip"
  | "first_seen_user_agent"
  | "last_seen_user_agent"
> & {
  metadata: HostedWebSessionMetadata | null;
};

type AttemptOverviewSession = HostedAttemptReadModel["sessions"][number] & {
  token: string;
  app: string;
  taskSlug: string;
  title: string | null;
  goal: string;
  startPath: string | null;
};

let supabaseAdmin: SupabaseClient<Database> | null | undefined;
let initializationRedis: RedisClientType | null = null;
let initializationRedisConnection: Promise<RedisClientType> | null = null;
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
const runSessionProjectionCacheTtlSeconds = Math.trunc(
  envNumber("HOSTED_SESSION_PROJECTION_CACHE_TTL_SECONDS", 10),
);
const accessLogRetentionMs = envNumber("HOSTED_ACCESS_LOG_RETENTION_MS", 14 * 24 * 60 * 60 * 1000);
const commandDeadRetentionMs = envNumber("ORCHESTRATOR_DLQ_DEAD_RETENTION_MS", 90 * 24 * 60 * 60 * 1000);
const commandResolvedRetentionMs = envNumber("ORCHESTRATOR_DLQ_RESOLVED_RETENTION_MS", 30 * 24 * 60 * 60 * 1000);
const commandDeadLetterPruneBatchSize = Math.trunc(envNumber("ORCHESTRATOR_DLQ_PRUNE_BATCH_SIZE", 500));

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

const DEFAULT_SESSION_TIME_LIMIT_MINUTES = 360;

function sessionExpiresAt(baseTime: string | number | Date, timeLimitMinutes?: number) {
  const minutes = typeof timeLimitMinutes === "number" && Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0
    ? timeLimitMinutes
    : DEFAULT_SESSION_TIME_LIMIT_MINUTES;
  return new Date(new Date(baseTime).getTime() + minutes * 60 * 1000).toISOString();
}

function buildViewerStartUrl(sessionId: string, startPath: string, expiresAt: string) {
  if (!viewerTokenSecret) {
    return null;
  }

  const token = createHostedViewerToken({
    sessionId,
    expiresAt,
    secret: viewerTokenSecret,
  });
  return `${hostedSitesPublicBaseUrl}${startPath}?session=${encodeURIComponent(token)}`;
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

const callbackOutbox = createCallbackOutboxProcessor({
  getSupabaseAdmin,
  webBaseUrl: agentbenchWebUrl || null,
  sharedSecret: runnerSharedSecret ?? null,
});

async function flushCallbackOutbox() {
  try {
    await callbackOutbox.process();
  } catch (error) {
    console.error("[hosted-orchestrator] callback outbox flush failed", error);
  }
}

function defaultStartPathForApp(app: string) {
  const base = app.replace(/-lite$/, "").replace(/[^a-z0-9-]/gi, "-");
  return `/${base || "shopping"}`;
}

function defaultGoalForSession(app: string, taskSlug: string) {
  return `Complete the hosted task ${taskSlug} in ${app}.`;
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

function commandIdFromRequest(request: IncomingMessage) {
  const value = request.headers["x-command-id"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
  _session: AttemptLifecycleSession,
  _result: Pick<HostedWebScoreResult, "status" | "score" | "summary">,
) {
  await flushCallbackOutbox();
}

async function forwardTimeoutCompletion(params: {
  runId: string;
  summary: string;
  score?: number;
}) {
  void params;
  await flushCallbackOutbox();
}

async function recoverInitializedAttempt(params: {
  runId: string;
  caseId: string;
  expectedSessionCount: number;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Hosted attempt recovery requires a database connection.");
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { data: attemptRow, error: attemptError } = await supabase
      .from("benchmark_attempts")
      .select("id, suite_slug, suite_version, metadata")
      .eq("run_id", params.runId)
      .eq("case_id", params.caseId)
      .eq("provider", "hosted-web")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (attemptError) {
      throw attemptError;
    }

    if (attemptRow) {
      const { data: sessionRows, error: sessionError } = await supabase
        .from("hosted_web_sessions")
        .select(
          "id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, start_url, status, metadata, expires_at",
        )
        .eq("attempt_id", attemptRow.id)
        .order("sequence_index", { ascending: true });

      if (sessionError) {
        throw sessionError;
      }

      if (sessionRows?.length === params.expectedSessionCount) {
        return {
          attemptId: attemptRow.id,
          suiteSlug: attemptRow.suite_slug,
          suiteVersion: attemptRow.suite_version,
          metadata: extractMetadata(attemptRow.metadata as Record<string, unknown> | null),
          sessions: sessionRows.map((row) => {
            const metadata = extractMetadata(row.metadata as Record<string, unknown> | null);
            const token = tokenFromStartUrl(row.start_url);
            const startPath =
              typeof metadata.startPath === "string"
                ? metadata.startPath
                : new URL(row.start_url).pathname;
            if (!token || typeof metadata.goal !== "string") {
              throw new Error(`Hosted session ${row.id} cannot be recovered.`);
            }
            return {
              sessionId: row.id,
              attemptId: row.attempt_id,
              token,
              app: row.app,
              taskSlug: row.task_slug,
              taskVersion: row.task_version,
              sequenceIndex: row.sequence_index,
              weight: row.weight,
              required: row.required,
              startUrl: row.start_url,
              viewerStartUrl: buildViewerStartUrl(
                row.id,
                startPath,
                row.expires_at ?? new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
              ),
              goal: metadata.goal,
              title: typeof metadata.title === "string" ? metadata.title : null,
              status: row.status,
            };
          }),
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out recovering concurrently initialized hosted attempt.");
}

async function getInitializationRedis() {
  if (initializationRedis?.isReady) {
    return initializationRedis;
  }
  if (!orchestratorRedisUrl) {
    return null;
  }
  if (!initializationRedisConnection) {
    const client = createRedisClient({ url: orchestratorRedisUrl });
    client.on("error", (error) => {
      console.error("[hosted-orchestrator] attempt initialization lock error", error);
    });
    initializationRedisConnection = client.connect().then(() => {
      initializationRedis = client;
      return client;
    }).catch((error) => {
      initializationRedisConnection = null;
      throw error;
    });
  }
  return initializationRedisConnection;
}

async function getProjectionCacheRedis() {
  return (await getInitializationRedis()) as ProjectionCacheRedis | null;
}

async function readCachedRunSessionProjection(runId: string) {
  try {
    const redis = await getProjectionCacheRedis();
    return redis ? await readRunSessionProjectionCache(redis, runId) : null;
  } catch (error) {
    console.error("[hosted-orchestrator] run session projection cache read failed", error);
    return null;
  }
}

async function cacheRunSessionProjection(runId: string, sessions: RunSessionProjection[]) {
  try {
    const redis = await getProjectionCacheRedis();
    if (redis) {
      await writeRunSessionProjectionCache(
        redis,
        runId,
        sessions,
        runSessionProjectionCacheTtlSeconds,
      );
    }
  } catch (error) {
    console.error("[hosted-orchestrator] run session projection cache write failed", error);
  }
}

async function invalidateRunSessionProjection(runId: string | null | undefined) {
  if (!runId) {
    return;
  }
  try {
    const redis = await getProjectionCacheRedis();
    if (redis) {
      await invalidateRunSessionProjectionCache(redis, runId);
    }
  } catch (error) {
    console.error("[hosted-orchestrator] run session projection cache invalidation failed", error);
  }
}

async function findExistingInitializedAttempt(
  params: Parameters<typeof initializeAttempt>[0],
) {
  if (!params.runId || !params.caseId) {
    return null;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Hosted attempt initialization requires a database connection.");
  }
  const { data, error } = await supabase
    .from("benchmark_attempts")
    .select("id, case_revision_id")
    .eq("run_id", params.runId)
    .eq("case_id", params.caseId)
    .eq("provider", "hosted-web")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (data) {
    if (data.case_revision_id !== params.caseRevisionId) {
      throw new Error("Existing hosted attempt is bound to a different benchmark revision.");
    }
    const revision = await loadBenchmarkCaseRevision(params.caseId, params.caseRevisionId);
    return recoverInitializedAttempt({
      runId: params.runId,
      caseId: params.caseId,
      expectedSessionCount: revision.sessions.length,
    });
  }
  return null;
}

async function acquireInitializationLease(key: string) {
  let redis: RedisClientType | null;
  try {
    redis = await getInitializationRedis();
  } catch (error) {
    console.error("[hosted-orchestrator] Redis unavailable; relying on database idempotency", error);
    return null;
  }
  if (!redis) {
    return null;
  }
  const lockOwner = crypto.randomUUID();
  const acquired = await redis.set(`agentbench:hosted-attempt-init:${key}`, lockOwner, { NX: true, PX: 30_000 });
  if (acquired !== "OK") return "contended" as const;
  return {
    release: async () => {
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [`agentbench:hosted-attempt-init:${key}`], arguments: [lockOwner] },
      );
    },
  };
}

type InitializeAttemptParams = {
  runId: string | null;
  caseId: string | null;
  caseRevisionId: string | null;
  callbackSecret: string | null;
  generationSeed?: string;
};

async function loadBenchmarkCaseRevision(caseId: string, caseRevisionId: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Hosted attempt initialization requires a database connection.");
  }
  return resolveBenchmarkCaseRevision({
    caseId,
    caseRevisionId,
    loadRevision: async (revisionId) => {
      const { data, error } = await supabase
        .from("benchmark_case_revisions")
        .select("id, case_id, revision, content_hash, manifest")
        .eq("id", revisionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

async function initializeAttempt(params: InitializeAttemptParams) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !params.runId || !params.caseId) {
    throw new Error("Hosted attempt initialization requires database-backed run and case ids.");
  }
  const runId = params.runId;
  const caseId = params.caseId;
  const revision = await loadBenchmarkCaseRevision(caseId, params.caseRevisionId);
  const generated = generateAttemptQuestions(revision.sessions, params.generationSeed);
  const generatedSessions = generated.sessions;

  const metadata = {
    generationSeed: generated.generationSeed,
    caseRevisionId: revision.id,
    caseRevision: revision.revision,
    caseRevisionContentHash: revision.contentHash,
    activeSessionId: null,
    activeSequenceIndex: 0,
    completedSessionIds: [],
    // Carry the suite's per-testcase time limit onto attempt metadata so the
    // connection prompt and frontends can show the same deadline.
    timeLimitMinutesPerTestcase: revision.timeLimitMinutesPerTestcase,
    // Carry the suite's cross-app consistency checks onto attempt metadata so
    // completion-time aggregation can evaluate them without re-reading the
    // manifest. Absent for suites without a chain.
    consistencyChecks: revision.consistencyChecks ?? [],
  };

  const { data: attemptRow, error: attemptError } = await supabase
    .from("benchmark_attempts")
    .insert({
      run_id: runId,
      case_id: caseId,
      case_revision_id: revision.id,
      provider: "hosted-web",
      suite_slug: revision.suiteSlug,
      suite_version: revision.suiteVersion,
      status: "running",
      metadata,
      started_at: now(),
    })
    .select("id, suite_slug, suite_version, metadata")
    .single();

  if (attemptError || !attemptRow) {
    if (attemptError?.code === "23505") {
      return recoverInitializedAttempt({
        runId,
        caseId,
        expectedSessionCount: generatedSessions.length,
      });
    }
    throw attemptError ?? new Error("Failed to create hosted attempt");
  }

  const suiteTimeLimitMinutes = revision.timeLimitMinutesPerTestcase;
  const orderedSessions = [...generatedSessions].sort((left, right) => left.sequenceIndex - right.sequenceIndex);
  const rows = orderedSessions.map((session) => {
    const token = makeId("tok");
    const startPath = session.startPath ?? defaultStartPathForApp(session.app);
    const startUrl = `${hostedSitesPublicBaseUrl}${startPath}?session=${encodeURIComponent(token)}`;
    const status: HostedSessionStatus = session.sequenceIndex > 0 ? "created" : "active";
    const sessionExpiresAtValue = status === "active"
      ? sessionExpiresAt(Date.now(), suiteTimeLimitMinutes)
      : null;
    const sessionMetadata = {
      ...session.metadata,
      schemaVersion: 1,
      suiteSlug: revision.suiteSlug,
      suiteVersion: revision.suiteVersion,
      caseRevisionId: revision.id,
      caseRevision: revision.revision,
      caseRevisionContentHash: revision.contentHash,
      title: session.title,
      goal: session.goal,
      startPath,
      timeLimitMinutesPerTestcase: suiteTimeLimitMinutes,
    } satisfies HostedWebSessionMetadata;

    return {
      run_id: runId,
      case_id: caseId,
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
      expires_at: sessionExpiresAtValue,
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
  await invalidateRunSessionProjection(runId);

  const rowsByStartUrl = new Map(createdRows.map((row) => [row.start_url, row]));
  const sessions = rows
    .map((seed) => {
      const row = rowsByStartUrl.get(seed.start_url);
      if (!row) {
        return null;
      }
      const metadata = extractMetadata(row.metadata as Record<string, unknown> | null);
      if (typeof metadata.goal !== "string" || metadata.goal.length === 0) {
        throw new Error(`Generated hosted session ${row.id} is missing its goal.`);
      }
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
        viewerStartUrl: seed.expires_at
          ? buildViewerStartUrl(row.id, new URL(seed.start_url).pathname, seed.expires_at)
          : null,
        goal: metadata.goal,
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

  await Promise.all(
    sessions.map((session) =>
      forwardRunEvent(
        {
          id: session.sessionId,
          token: session.token,
          runId,
          attemptId: attemptRow.id,
          app: session.app,
          taskSlug: session.taskSlug,
          suiteSlug: revision.suiteSlug,
          sequenceIndex: session.sequenceIndex,
          weight: session.weight,
          status: session.status === "scoring" ? "active" : session.status,
          startPath: new URL(session.startUrl).pathname,
          persisted: true,
        },
        "hosted.session.created",
        {
          source: "hosted-orchestrator",
          sessionId: session.sessionId,
          attemptId: attemptRow.id,
          app: session.app,
          taskSlug: session.taskSlug,
          sequenceIndex: session.sequenceIndex,
          weight: session.weight,
          required: session.required,
          viewerStartUrl: session.viewerStartUrl,
        },
      ),
    ),
  );

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
      "id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, start_url, expires_at, created_at, access_count, last_accessed_at, first_seen_ip, last_seen_ip, first_seen_user_agent, last_seen_user_agent",
    )
    .eq("session_token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PersistedSessionRow;
}

async function recoverHostedSession(params: { token?: string; sessionId?: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from("hosted_web_sessions")
    .select(
      "id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, start_url, expires_at, created_at, access_count, last_accessed_at, first_seen_ip, last_seen_ip, first_seen_user_agent, last_seen_user_agent",
    );
  if (params.token) {
    query = query.eq("session_token_hash", hashToken(params.token));
  } else if (params.sessionId) {
    query = query.eq("id", params.sessionId);
  } else {
    return null;
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function persistHostedSessionSnapshot(token: string, metadata: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .update({ metadata })
    .eq("session_token_hash", hashToken(token))
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[hosted-orchestrator] failed to persist session snapshot", error);
  }
  return Boolean(data) && !error;
}

async function persistHostedSessionAccess(
  token: string,
  input: Record<string, unknown>,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return false;
  }

  const session = await loadSessionByToken(token);
  if (!session) {
    return false;
  }

  const nullableString = (value: unknown) => (typeof value === "string" ? value : null);
  const accessCount =
    typeof input.accessCount === "number" && Number.isFinite(input.accessCount)
      ? Math.max(0, Math.trunc(input.accessCount))
      : 0;
  const accessedAt = nullableString(input.accessedAt) ?? now();

  const { error: sessionError } = await supabase
    .from("hosted_web_sessions")
    .update({
      access_count: accessCount,
      last_accessed_at: accessedAt,
      first_seen_ip: nullableString(input.firstSeenIp),
      last_seen_ip: nullableString(input.lastSeenIp),
      first_seen_user_agent: nullableString(input.firstSeenUserAgent),
      last_seen_user_agent: nullableString(input.lastSeenUserAgent),
    })
    .eq("id", session.id);

  const { error: logError } = await supabase.from("hosted_web_access_logs").insert({
    session_id: session.id,
    attempt_id: session.attempt_id,
    run_id: session.run_id,
    event: typeof input.event === "string" ? input.event : "session.access",
    ip: nullableString(input.ip),
    user_agent: nullableString(input.userAgent),
    referer: nullableString(input.referer),
    metadata: {
      app: session.app,
      taskSlug: session.task_slug,
    },
  });

  if (sessionError) {
    console.error("[hosted-orchestrator] failed to update session access", sessionError);
  }
  if (logError) {
    console.error("[hosted-orchestrator] failed to persist access log", logError);
  }
  return !sessionError && !logError;
}

async function persistHostedEvent(token: string, payload: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return false;
  }

  const session = await loadSessionByToken(token);
  if (!session || !session.run_id || session.status !== "active") {
    return false;
  }

  const type = typeof payload.type === "string" ? payload.type : "hosted.event";
  const { error } = await supabase.from("hosted_web_events").insert({
    session_id: session.id,
    run_id: session.run_id,
    attempt_id: session.attempt_id,
    type,
    name: typeof payload.name === "string" ? payload.name : type,
    payload,
  });

  if (error) {
    console.error("[hosted-orchestrator] failed to persist hosted event", error);
  }
  return !error;
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
  forwardTimeoutCompletion,
  evictInMemorySessions: () => undefined,
  invalidateRunSessionProjection,
});

const initializeAttemptIdempotently = createIdempotentInitializer({
  key: (params: Parameters<typeof initializeAttempt>[0]) => `${params.runId}:${params.caseId}:${params.caseRevisionId}`,
  findExisting: findExistingInitializedAttempt,
  waitForExisting: async (params) => {
    if (!params.runId || !params.caseId) {
      throw new Error("Hosted attempt recovery requires run and case ids.");
    }
    return recoverInitializedAttempt({
      runId: params.runId,
      caseId: params.caseId,
      expectedSessionCount: (await loadBenchmarkCaseRevision(params.caseId, params.caseRevisionId)).sessions.length,
    });
  },
  acquireLock: acquireInitializationLease,
  create: initializeAttempt,
});

const initializeAttemptSingleFlight = createSingleFlight({
  key: (params: Parameters<typeof initializeAttempt>[0]) => `${params.runId}:${params.caseId}:${params.caseRevisionId}`,
  run: initializeAttemptIdempotently,
});

const attemptHandlers = createAttemptHandlers<HostedAttemptReadModel<AttemptOverviewSession>>({
  initializeAttempt: initializeAttemptSingleFlight,
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
  publicBaseUrl: hostedSitesPublicBaseUrl,
  defaultStartPathForApp,
});

async function dispatchWriteCommand(type: string, input: Record<string, unknown>) {
  if (type === "attempt.init") {
    const initialized = await attemptHandlers.handleInitializeAttempt(input as Parameters<typeof attemptHandlers.handleInitializeAttempt>[0]);
    return initialized;
  }

  if (type === "session.snapshot") {
    const token = typeof input.token === "string" ? input.token : "";
    const metadata =
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : null;
    if (!token || !metadata) {
      return { statusCode: 400, body: { error: "Missing token or metadata" } };
    }
    const ok = await persistHostedSessionSnapshot(token, metadata);
    return { statusCode: ok ? 200 : 404, body: ok ? { ok: true } : { error: "Unknown session" } };
  }

  if (type === "session.access") {
    const token = typeof input.token === "string" ? input.token : "";
    if (!token) {
      return { statusCode: 400, body: { error: "Missing token" } };
    }
    const { token: _token, ...access } = input;
    const ok = await persistHostedSessionAccess(token, access);
    return { statusCode: ok ? 200 : 404, body: ok ? { ok: true } : { error: "Unknown session" } };
  }

  if (type === "session.event") {
    const token = typeof input.token === "string" ? input.token : "";
    const payload =
      input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? (input.payload as Record<string, unknown>)
        : null;
    if (!token || !payload) {
      return { statusCode: 400, body: { error: "Missing token or payload" } };
    }
    const ok = await persistHostedEvent(token, payload);
    return { statusCode: ok ? 200 : 404, body: ok ? { ok: true } : { error: "Unknown session" } };
  }

  if (type === "attempt.complete-session") {
    const attemptId = typeof input.attemptId === "string" ? input.attemptId : "";
    const sessionToken = typeof input.sessionToken === "string" ? input.sessionToken : "";
    const sessionRow = sessionToken ? await loadSessionByToken(sessionToken) : null;
    if (!sessionRow || sessionRow.attempt_id !== attemptId) {
      return { statusCode: 404, body: { error: "Unknown session" } };
    }
    const resultInput =
      input.result && typeof input.result === "object" && !Array.isArray(input.result)
        ? (input.result as Record<string, unknown>)
        : null;
    if (!resultInput) {
      return { statusCode: 400, body: { error: "Missing result" } };
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
    const completed = await attemptHandlers.handleCompleteSession({
      session: {
        ...buildLifecycleSessionFromRow(sessionRow, sessionToken),
        finalState: input.finalState ?? null,
      },
      result,
    });
    return completed;
  }

  if (type === "attempt.timeout") {
    const timedOut = await attemptHandlers.handleTimeoutAttempt({
      attemptId: typeof input.attemptId === "string" ? input.attemptId : "",
      runId: typeof input.runId === "string" ? input.runId : null,
      expiredSessionId: typeof input.expiredSessionId === "string" ? input.expiredSessionId : "",
      expiredTaskSlug: typeof input.expiredTaskSlug === "string" ? input.expiredTaskSlug : "",
    });
    return timedOut;
  }

  if (type === "maintenance.cleanup") {
    const expiredSessions = await sweepExpiredSessions();
    const prunedAccessLogs = await pruneExpiredAccessLogs();
    const scrubbedCommandDeadLetters = await scrubHistoricalCommandDeadLetters();
    const prunedCommandDeadLetters = await pruneExpiredCommandDeadLetters();
    const callbacks = await processCallbackCleanup();
    return {
      statusCode: 200,
      body: {
        expiredSessions,
        prunedAccessLogs,
        scrubbedCommandDeadLetters,
        prunedCommandDeadLetters,
        callbacks,
      },
    };
  }

  return { statusCode: 400, body: { error: "Unknown command type" } };
}

async function persistCommandDeadLetter(deadLetter: CommandDeadLetter) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Command DLQ persistence requires a database connection.");
  }
  const timestamp = now();
  const { error } = await supabase.from("orchestrator_command_dead_letters").upsert(
    {
      command_id: deadLetter.commandId,
      stream: deadLetter.stream,
      message_id: deadLetter.messageId,
      partition: deadLetter.partition,
      partition_key: deadLetter.partitionKey,
      payload_type: deadLetter.payloadType,
      payload: redactCommandPayload(deadLetter.payload),
      error_code: deadLetter.errorCode,
      error_message: redactCommandErrorMessage(deadLetter.errorMessage),
      attempts: deadLetter.attempts,
      status: "dead",
      scrubbed_at: timestamp,
      updated_at: timestamp,
    },
    { onConflict: "command_id" },
  );
  if (error) {
    throw error;
  }
}

if (!orchestratorRedisUrl) {
  throw new Error("ORCHESTRATOR_REDIS_URL is required for the orchestrator command backbone.");
}

const commandBackbone = createCommandBackbone({
  redisUrl: orchestratorRedisUrl,
  handler: dispatchWriteCommand,
  role: orchestratorMode,
  partitionCount: orchestratorPartitionCount,
  assignedPartitions: workerPartitions,
  onDeadLetter: persistCommandDeadLetter,
});

async function sweepExpiredSessions() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return 0;
  }

  const sweepStartedAt = now();
  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select(
      "id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, start_url, expires_at, created_at",
    )
    .lt("expires_at", sweepStartedAt)
    .in("status", ["created", "active", "scoring"])
    .limit(500);

  if (error) {
    console.error("[hosted-orchestrator] failed to discover expired sessions", error);
    return 0;
  }

  const expiredRows = (data ?? []) as PersistedSessionRow[];
  if (expiredRows.length === 0) {
    return 0;
  }

  const { error: accessLogError } = await supabase.from("hosted_web_access_logs").insert(
    expiredRows.map((row) => ({
      session_id: row.id,
      attempt_id: row.attempt_id,
      run_id: row.run_id,
        event: "session.expiry_detected",
      metadata: {
        app: row.app,
        taskSlug: row.task_slug,
      },
    })),
  );

  if (accessLogError) {
    console.error("[hosted-orchestrator] failed to persist expiry sweep logs", accessLogError);
  }

  for (const row of expiredRows) {
    const token = tokenFromStartUrl(row.start_url);
    if (!token || !row.attempt_id) {
      continue;
    }
    const session = buildLifecycleSessionFromRow(row, token);
    try {
      await attemptHandlers.handleCompleteSession({
        session,
        result: {
          status: "failed",
          score: 0,
          summary: `Hosted session ${row.task_slug} timed out after ${row.metadata?.timeLimitMinutesPerTestcase ?? 360} minutes.`,
          evaluators: [],
        },
      });
    } catch (error) {
      console.error(
        `[hosted-orchestrator] failed to finalize timed-out session ${row.id} (${row.task_slug})`,
        error,
      );
    }
  }

  return expiredRows.length;
}

async function pruneExpiredCommandDeadLetters() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return 0;
  }

  try {
    return await pruneCommandDeadLetters(supabase, {
      deadRetentionMs: commandDeadRetentionMs,
      resolvedRetentionMs: commandResolvedRetentionMs,
      batchSize: commandDeadLetterPruneBatchSize,
    });
  } catch (error) {
    console.error("[hosted-orchestrator] failed to prune command dead letters", error);
    return 0;
  }
}

async function scrubHistoricalCommandDeadLetters() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return 0;
  }

  try {
    return await scrubCommandDeadLetters(supabase, commandDeadLetterPruneBatchSize);
  } catch (error) {
    console.error("[hosted-orchestrator] failed to scrub command dead letters", error);
    return 0;
  }
}

async function processCallbackCleanup() {
  try {
    return await callbackOutbox.process(20, true);
  } catch (error) {
    console.error("[hosted-orchestrator] failed to process callback cleanup", error);
    return { reconciled: 0, claimed: 0, delivered: 0, retried: 0, dead: 0 };
  }
}

async function runCleanupSweep(trigger: "startup" | "interval") {
  if (cleanupSweepInFlight) {
    return;
  }

  cleanupSweepInFlight = true;
  try {
    const sweepBucket = Math.floor(Date.now() / cleanupSweepIntervalMs);
    const result = await commandBackbone.execute(
      "maintenance.cleanup",
      { trigger },
      "maintenance",
      `maintenance-cleanup-${sweepBucket}`,
    );
    const body = result.body as {
      expiredSessions?: number;
      prunedAccessLogs?: number;
      scrubbedCommandDeadLetters?: number;
      prunedCommandDeadLetters?: number;
      callbacks?: { reconciled?: number; delivered?: number; retried?: number; dead?: number };
    };
    const expiredSessions = body.expiredSessions ?? 0;
    const prunedAccessLogs = body.prunedAccessLogs ?? 0;
    const scrubbedCommandDeadLetters = body.scrubbedCommandDeadLetters ?? 0;
    const prunedCommandDeadLetters = body.prunedCommandDeadLetters ?? 0;
    const callbackChanges = (body.callbacks?.reconciled ?? 0) + (body.callbacks?.delivered ?? 0) +
      (body.callbacks?.retried ?? 0) + (body.callbacks?.dead ?? 0);
    if (
      expiredSessions > 0 ||
      prunedAccessLogs > 0 ||
      scrubbedCommandDeadLetters > 0 ||
      prunedCommandDeadLetters > 0 ||
      callbackChanges > 0
    ) {
      console.log(
        `[hosted-orchestrator] cleanup(${trigger}) expired=${expiredSessions} access_logs=${prunedAccessLogs} command_dlq_scrubbed=${scrubbedCommandDeadLetters} command_dlq_pruned=${prunedCommandDeadLetters} callbacks=${JSON.stringify(body.callbacks ?? {})}`,
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
      const readiness = await commandBackbone.readiness();
      sendJson(response, readiness.ready ? 200 : 503, {
        ok: readiness.ready,
        commandBackbone: "redis-streams",
        mode: orchestratorMode,
        partitions: orchestratorPartitionCount,
        missingPartitions: readiness.missingPartitions,
      });
      return;
    }

    if (!isInternalRunnerRequest(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/commands/dead-letters") {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        sendJson(response, 503, { error: "database_unavailable" });
        return;
      }
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100));
      const status = url.searchParams.get("status");
      let query = supabase
        .from("orchestrator_command_dead_letters")
        .select("id, command_id, partition, partition_key, payload_type, error_code, error_message, attempts, status, replay_command_id, replayed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status === "dead" || status === "replayed" || status === "resolved") {
        query = query.eq("status", status);
      }
      const { data, error } = await query;
      if (error) {
        throw error;
      }
      sendJson(response, 200, { deadLetters: data ?? [] });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/attempts/connection") {
      const runId = url.searchParams.get("runId");
      const caseId = url.searchParams.get("caseId");
      const caseRevisionId = url.searchParams.get("caseRevisionId");
      if (!runId || !caseId || !caseRevisionId) {
        badRequest(response, "Missing runId, caseId, or caseRevisionId");
        return;
      }

      let connection;
      try {
        connection = await findExistingInitializedAttempt({
          runId,
          caseId,
          caseRevisionId,
          callbackSecret: null,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("different benchmark revision")) {
          sendJson(response, 409, { error: "attempt_revision_conflict" });
          return;
        }
        throw error;
      }
      if (!connection) {
        sendJson(response, 404, { error: "attempt_not_found" });
        return;
      }

      sendJson(response, 200, hostedAttemptConnectionSnapshotSchema.parse(connection));
      return;
    }

    const runSessionsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/sessions$/);
    if (request.method === "GET" && runSessionsMatch) {
      const runId = decodeURIComponent(runSessionsMatch[1]!);
      let sessions = await readCachedRunSessionProjection(runId);
      if (!sessions) {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
          sendJson(response, 503, { error: "database_unavailable" });
          return;
        }
        const { data, error } = await supabase
          .from("hosted_web_sessions")
          .select("id, task_slug, status, sequence_index, expires_at, metadata")
          .eq("run_id", runId)
          .order("sequence_index", { ascending: true });
        if (error) {
          sendJson(response, 500, { error: "session_read_failed" });
          return;
        }
        sessions = (data ?? []).map((item) => {
          const metadata = extractMetadata(item.metadata as Record<string, unknown> | null);
          return {
            sessionId: item.id,
            taskSlug: item.task_slug ?? "hosted-task",
            status: item.status ?? "created",
            sequenceIndex: item.sequence_index ?? 0,
            expiresAt: item.expires_at ?? null,
            timeLimitMinutes:
              typeof metadata.timeLimitMinutesPerTestcase === "number"
                ? metadata.timeLimitMinutesPerTestcase
                : null,
          };
        });
        await cacheRunSessionProjection(runId, sessions);
      }
      sendJson(response, 200, { sessions });
      return;
    }

    const replayDeadLetterMatch = url.pathname.match(/^\/api\/commands\/dead-letters\/([^/]+)\/replay$/);
    if (request.method === "POST" && replayDeadLetterMatch) {
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        sendJson(response, 503, { error: "database_unavailable" });
        return;
      }
      const deadLetterId = decodeURIComponent(replayDeadLetterMatch[1]);
      const { data: deadLetter, error: loadError } = await supabase
        .from("orchestrator_command_dead_letters")
        .select("id, command_id, partition_key, payload_type, payload, status")
        .eq("id", deadLetterId)
        .maybeSingle();
      if (loadError) {
        throw loadError;
      }
      if (!deadLetter) {
        sendJson(response, 404, { error: "dead_letter_not_found" });
        return;
      }
      if (deadLetter.status !== "dead") {
        sendJson(response, 409, { error: "dead_letter_not_replayable", status: deadLetter.status });
        return;
      }
      const replayCommandId = crypto.randomUUID();
      const payload = deadLetter.payload && typeof deadLetter.payload === "object" && !Array.isArray(deadLetter.payload)
        ? deadLetter.payload as Record<string, unknown>
        : {};
      const replay = await commandBackbone.execute(
        deadLetter.payload_type,
        payload,
        deadLetter.partition_key ?? deadLetter.command_id,
        replayCommandId,
      );
      if (replay.statusCode >= 500) {
        sendJson(response, 409, { error: "dead_letter_replay_failed", replayCommandId, response: replay });
        return;
      }
      const replayedAt = now();
      const { error: updateError } = await supabase
        .from("orchestrator_command_dead_letters")
        .update({ status: "replayed", replay_command_id: replayCommandId, replayed_at: replayedAt, updated_at: replayedAt })
        .eq("id", deadLetter.id)
        .eq("status", "dead");
      if (updateError) {
        throw updateError;
      }
      sendJson(response, 200, { replayCommandId, response: replay });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/attempts/init") {
      const input = await readJson(request);
      const initialized = await commandBackbone.execute("attempt.init", {
        runId: typeof input.runId === "string" ? input.runId : null,
        caseId: typeof input.caseId === "string" ? input.caseId : null,
        caseRevisionId: typeof input.caseRevisionId === "string" ? input.caseRevisionId : null,
        callbackSecret: typeof input.callbackSecret === "string" ? input.callbackSecret : null,
        generationSeed: typeof input.generationSeed === "string" ? input.generationSeed : undefined,
      }, typeof input.runId === "string" ? input.runId : typeof input.caseId === "string" ? input.caseId : "attempt.init", commandIdFromRequest(request));
      sendJson(response, initialized.statusCode, initialized.body);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sessions/recover") {
      const input = await readJson(request);
      const recovered = await recoverHostedSession({
        token: typeof input.token === "string" ? input.token : undefined,
        sessionId: typeof input.sessionId === "string" ? input.sessionId : undefined,
      });
      if (!recovered) {
        sendJson(response, 404, { error: "session_not_found" });
        return;
      }
      sendJson(response, 200, recovered);
      return;
    }

    const sessionResultMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/result$/);
    if (request.method === "GET" && sessionResultMatch) {
      const result = await loadLatestSessionResult(decodeURIComponent(sessionResultMatch[1]));
      if (!result) {
        sendJson(response, 404, { error: "Session result not found" });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    const sessionSnapshotMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/commands\/snapshot$/);
    if (request.method === "POST" && sessionSnapshotMatch) {
      const input = await readJson(request);
      const metadata =
        input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? (input.metadata as Record<string, unknown>)
          : null;
      if (!metadata) {
        badRequest(response, "Missing metadata");
        return;
      }
      const result = await commandBackbone.execute("session.snapshot", {
        token: decodeURIComponent(sessionSnapshotMatch[1]),
        metadata,
      }, decodeURIComponent(sessionSnapshotMatch[1]), commandIdFromRequest(request));
      sendJson(response, result.statusCode, result.body);
      return;
    }

    const sessionAccessMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/commands\/access$/);
    if (request.method === "POST" && sessionAccessMatch) {
      const input = await readJson(request);
      const result = await commandBackbone.execute("session.access", {
        token: decodeURIComponent(sessionAccessMatch[1]),
        ...input,
      }, decodeURIComponent(sessionAccessMatch[1]), commandIdFromRequest(request));
      sendJson(response, result.statusCode, result.body);
      return;
    }

    const sessionEventMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/commands\/event$/);
    if (request.method === "POST" && sessionEventMatch) {
      const input = await readJson(request);
      const payload =
        input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
          ? (input.payload as Record<string, unknown>)
          : null;
      if (!payload) {
        badRequest(response, "Missing payload");
        return;
      }
      const result = await commandBackbone.execute("session.event", {
        token: decodeURIComponent(sessionEventMatch[1]),
        payload,
      }, decodeURIComponent(sessionEventMatch[1]), commandIdFromRequest(request));
      sendJson(response, result.statusCode, result.body);
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

      const completion = await commandBackbone.execute("attempt.complete-session", {
        attemptId,
        sessionToken,
        result: input.result,
        finalState: input.finalState ?? null,
      }, attemptId, commandIdFromRequest(request));
      sendJson(response, completion.statusCode, completion.body);
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

      const timeout = await commandBackbone.execute("attempt.timeout", {
        attemptId: decodeURIComponent(timeoutMatch[1]),
        runId: typeof input.runId === "string" ? input.runId : null,
        expiredSessionId,
        expiredTaskSlug,
      }, decodeURIComponent(timeoutMatch[1]), commandIdFromRequest(request));
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

await commandBackbone.start();

if (orchestratorMode !== "worker") {
  server.listen(port, () => {
    console.log(`[hosted-orchestrator] listening on ${publicBaseUrl}`);
  });
  void runCleanupSweep("startup");
  setInterval(() => {
    void runCleanupSweep("interval");
  }, cleanupSweepIntervalMs);
}

console.log(
  `[hosted-orchestrator] redis backbone mode=${commandBackbone.info.role} partitions=${commandBackbone.info.assignedPartitions.join(",")}`,
);
