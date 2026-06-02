import type {
  BenchmarkCase,
  BenchmarkRun,
  HostedWebSuiteMetadata,
  HostedWebSuiteSession,
} from "@agentbench/protocol";
import { buildHostedAttemptReadModel } from "@agentbench/shared";
import { hostedWebSuiteMetadataSchema } from "@agentbench/protocol";
import { createSupabaseAdminClient } from "./supabase/admin";

type HostedSessionStatus = "created" | "active" | "completed" | "failed" | "expired";

export type HostedWebSessionConnection = {
  sessionId: string;
  attemptId: string | null;
  token: string | null;
  app: string;
  taskSlug: string;
  taskVersion: string;
  sequenceIndex: number;
  weight: number;
  required: boolean;
  startUrl: string;
  goal: string;
  title: string | null;
  status: HostedSessionStatus;
};

export type HostedWebAttemptConnection = {
  attemptId: string | null;
  suiteSlug: string;
  suiteVersion: string;
  orchestratorUrl: string | null;
  advanceUrl: string | null;
  activeSessionId: string | null;
  progress: {
    currentIndex: number | null;
    total: number;
    completed: number;
  };
  sessions: HostedWebSessionConnection[];
};

type HostedWebAttempt = {
  id: string | null;
  suiteSlug: string;
  suiteVersion: string;
  sessionDefinitions: HostedWebSuiteSession[];
  metadata: Record<string, unknown>;
};

type HostedWebStore = {
  attemptsByRunId: Map<string, HostedWebAttempt | null>;
};

export class HostedWebSessionError extends Error {
  code = "hosted_session_create_failed" as const;
  status: number;
  hostedSitesUrl: string;
  retryable: boolean;

  constructor(params: {
    message: string;
    status?: number;
    hostedSitesUrl: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "HostedWebSessionError";
    this.status = params.status ?? 502;
    this.hostedSitesUrl = params.hostedSitesUrl;
    this.retryable = params.retryable ?? true;
  }
}

declare global {
  var __agentbenchHostedWebStore: HostedWebStore | undefined;
}

function getStore() {
  if (!global.__agentbenchHostedWebStore) {
    global.__agentbenchHostedWebStore = {
      attemptsByRunId: new Map(),
    };
  }

  return global.__agentbenchHostedWebStore;
}

function getHostedSitesBaseUrl() {
  return process.env.HOSTED_SITES_URL ?? "http://localhost:3003";
}

function getHostedOrchestratorBaseUrl() {
  return process.env.HOSTED_ORCHESTRATOR_URL ?? "http://localhost:3004";
}

function resolveHostedUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const basePath = base.pathname.replace(/\/+$/, "");
  const requestPath = path.startsWith("/") ? path : `/${path}`;
  base.pathname = `${basePath}${requestPath}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

function metadataString(metadata: Record<string, unknown>, key: string, fallback: string) {
  return typeof metadata[key] === "string" ? metadata[key] : fallback;
}

function metadataNumber(metadata: Record<string, unknown>, key: string, fallback: number) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metadataBoolean(metadata: Record<string, unknown>, key: string, fallback: boolean) {
  const value = metadata[key];
  return typeof value === "boolean" ? value : fallback;
}

function tokenFromStartUrl(startUrl: string) {
  try {
    const url = new URL(startUrl);
    return url.searchParams.get("session");
  } catch {
    return null;
  }
}

function getHostedWebSuiteMetadata(benchmarkCase: BenchmarkCase): HostedWebSuiteMetadata {
  const metadata = benchmarkCase.metadata;
  const parsed = hostedWebSuiteMetadataSchema.safeParse(metadata);

  if (parsed.success && parsed.data.sessions.length > 0) {
    return parsed.data;
  }

  return hostedWebSuiteMetadataSchema.parse({
    ...metadata,
    suiteSlug: metadataString(metadata, "suiteSlug", benchmarkCase.slug),
    suiteVersion: metadataString(metadata, "suiteVersion", "v1"),
    taskSlug: metadataString(metadata, "taskSlug", benchmarkCase.slug),
    taskVersion: metadataString(metadata, "taskVersion", "v1"),
    seedVersion: metadataString(metadata, "seedVersion", "seed-v1"),
    sessions: [
      {
        app: metadataString(metadata, "app", "shopping-lite"),
        taskSlug: metadataString(metadata, "taskSlug", benchmarkCase.slug),
        title: typeof metadata.title === "string" ? metadata.title : benchmarkCase.title,
        goal: typeof metadata.goal === "string" ? metadata.goal : benchmarkCase.description,
        startPath: typeof metadata.startPath === "string" ? metadata.startPath : undefined,
        taskVersion: metadataString(metadata, "taskVersion", "v1"),
        seedVersion: metadataString(metadata, "seedVersion", "seed-v1"),
        sequenceIndex: 0,
        weight: metadataNumber(metadata, "weight", 1),
        required: metadataBoolean(metadata, "required", true),
        metadata: {},
      },
    ],
  });
}

function normalizeSessionDefinitions(benchmarkCase: BenchmarkCase) {
  const metadata = getHostedWebSuiteMetadata(benchmarkCase);
  const orderedSessions = [...metadata.sessions]
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
    .map((session, index) => ({
      ...session,
      title: session.title ?? benchmarkCase.title,
      goal: session.goal ?? benchmarkCase.description,
      sequenceIndex: index,
      weight: typeof session.weight === "number" && Number.isFinite(session.weight) ? session.weight : 1,
      required: session.required ?? true,
      metadata: session.metadata ?? {},
    }));

  return {
    suiteSlug: metadata.suiteSlug || benchmarkCase.slug,
    suiteVersion: metadata.suiteVersion || "v1",
    sessionDefinitions: orderedSessions,
  };
}

function toAttemptConnection(params: {
  attempt: HostedWebAttempt;
  sessions: HostedWebSessionConnection[];
}) {
  const baseUrl = getHostedSitesBaseUrl();
  const readModel = buildHostedAttemptReadModel({
    attemptId: params.attempt.id ?? "pending-attempt",
    metadata: params.attempt.metadata,
    sessions: params.sessions.map((session) => ({
      id: session.sessionId,
      sequenceIndex: session.sequenceIndex,
      status: session.status,
      session,
    })),
  });
  const activeSession =
    readModel.activeSessionId === null
      ? null
      : readModel.sessions.find((candidate) => candidate.id === readModel.activeSessionId)?.session ?? null;

  return {
    attemptId: params.attempt.id ?? null,
    suiteSlug: params.attempt.suiteSlug,
    suiteVersion: params.attempt.suiteVersion,
    orchestratorUrl:
      activeSession && params.attempt.id && activeSession.token
        ? `${baseUrl}/attempts/${encodeURIComponent(params.attempt.id)}?session=${encodeURIComponent(activeSession.token)}`
        : activeSession?.startUrl ?? null,
    advanceUrl:
      activeSession && params.attempt.id && activeSession.token
        ? `${baseUrl}/api/attempts/${encodeURIComponent(params.attempt.id)}/advance?session=${encodeURIComponent(activeSession.token)}`
        : null,
    activeSessionId: activeSession?.sessionId ?? null,
    progress: {
      currentIndex: activeSession?.sequenceIndex ?? null,
      total: params.sessions.length,
      completed: readModel.progress.completed,
    },
    sessions: params.sessions.map((session) => ({
      ...session,
      status:
        session.status === "completed" || session.status === "failed" || session.status === "expired"
          ? session.status
          : session.sessionId === activeSession?.sessionId
            ? "active"
            : "created",
    })),
  } satisfies HostedWebAttemptConnection;
}

export function isHostedWebCase(benchmarkCase: BenchmarkCase | null) {
  return benchmarkCase?.provider === "hosted-web";
}

async function findExistingHostedWebAttempt(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("benchmark_attempts")
    .select("id, suite_slug, suite_version, metadata")
    .eq("run_id", params.run.id)
    .eq("case_id", params.benchmarkCase.id)
    .eq("provider", "hosted-web")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const normalized = normalizeSessionDefinitions(params.benchmarkCase);
  return {
    id: data.id,
    suiteSlug: data.suite_slug,
    suiteVersion: data.suite_version,
    sessionDefinitions: normalized.sessionDefinitions,
    metadata:
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {},
  } satisfies HostedWebAttempt;
}

async function listExistingHostedWebSessions(attemptId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select("id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, start_url, status, metadata")
    .eq("attempt_id", attemptId)
    .order("sequence_index", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    return {
      sessionId: row.id,
      attemptId: row.attempt_id,
      token: tokenFromStartUrl(row.start_url),
      app: row.app,
      taskSlug: row.task_slug,
      taskVersion: row.task_version,
      sequenceIndex: row.sequence_index,
      weight: row.weight,
      required: row.required,
      startUrl: row.start_url,
      goal: typeof metadata.goal === "string" ? metadata.goal : "",
      title: typeof metadata.title === "string" ? metadata.title : null,
      status: row.status,
    } satisfies HostedWebSessionConnection;
  });
}

type HostedAttemptStateResponse = {
  attemptId: string;
  activeSessionId: string | null;
  activeSequenceIndex: number | null;
  completedSessionIds: string[];
  progress: {
    total: number;
    completed: number;
  };
  sessions: Array<{
    id: string;
    token: string;
    app: string;
    taskSlug: string;
    title: string | null;
    goal: string;
    sequenceIndex: number;
    status: HostedSessionStatus;
    startPath: string | null;
  }>;
};

type HostedAttemptAdvanceResponse = {
  attemptId: string;
  currentSessionId: string;
  complete: boolean;
  nextSessionId: string | null;
  nextStartUrl: string | null;
};

type HostedAttemptTimeoutResponse = {
  attemptId: string;
  runId: string | null;
  ok: boolean;
  summary: string | null;
};

type HostedAttemptCompleteResponse = {
  status: "passed" | "failed" | "error";
  score: number;
  summary: string;
  evaluators: unknown[];
};

function runnerSecretOrThrow() {
  const runnerSecret = process.env.RUNNER_SHARED_SECRET;
  if (!runnerSecret) {
    throw new HostedWebSessionError({
      message: "RUNNER_SHARED_SECRET is not configured for hosted orchestrator requests.",
      hostedSitesUrl: getHostedOrchestratorBaseUrl(),
      retryable: false,
      status: 500,
    });
  }

  return runnerSecret;
}

async function fetchHostedOrchestrator<T>(path: string, init?: RequestInit) {
  const baseUrl = getHostedOrchestratorBaseUrl();
  const runnerSecret = runnerSecretOrThrow();
  const requestUrl = resolveHostedUrl(baseUrl, path);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...init,
      headers: {
        "x-runner-secret": runnerSecret,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function fetchHostedAttemptState(attemptId: string) {
  return fetchHostedOrchestrator<HostedAttemptStateResponse>(
    `/api/attempts/${encodeURIComponent(attemptId)}/state`,
  );
}

export async function resolveHostedAttemptAdvance(params: {
  attemptId: string;
  currentSessionId: string;
}) {
  return fetchHostedOrchestrator<HostedAttemptAdvanceResponse>(
    `/api/attempts/${encodeURIComponent(params.attemptId)}/commands/resolve-advance`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentSessionId: params.currentSessionId,
      }),
    },
  );
}

export async function completeHostedAttemptSession(params: {
  attemptId: string;
  sessionToken: string;
}) {
  return fetchHostedOrchestrator<HostedAttemptCompleteResponse>(
    `/api/attempts/${encodeURIComponent(params.attemptId)}/commands/complete-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionToken: params.sessionToken,
      }),
    },
  );
}

export async function timeoutHostedAttempt(params: {
  attemptId: string;
  runId: string | null;
  expiredSessionId: string;
  expiredTaskSlug: string;
}) {
  return fetchHostedOrchestrator<HostedAttemptTimeoutResponse>(
    `/api/attempts/${encodeURIComponent(params.attemptId)}/commands/timeout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: params.runId,
        expiredSessionId: params.expiredSessionId,
        expiredTaskSlug: params.expiredTaskSlug,
      }),
    },
  );
}

async function persistAttemptState(params: {
  attemptId: string;
  attempt: HostedWebAttempt;
  sessions: HostedWebSessionConnection[];
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const activeSession = params.sessions[0] ?? null;
  const metadata = {
    ...params.attempt.metadata,
    sessions: params.attempt.sessionDefinitions.map((session) => ({
      app: session.app,
      taskSlug: session.taskSlug,
      taskVersion: session.taskVersion,
      sequenceIndex: session.sequenceIndex,
      weight: session.weight,
      required: session.required,
      title: session.title ?? null,
      goal: session.goal ?? null,
      seedVersion: session.seedVersion ?? null,
      metadata: session.metadata ?? {},
    })),
    activeSessionId: activeSession?.sessionId ?? null,
    activeSequenceIndex: activeSession?.sequenceIndex ?? null,
    completedSessionIds: params.sessions
      .filter((session) => session.status === "completed")
      .map((session) => session.sessionId),
  };

  await supabase.from("benchmark_attempts").update({ metadata }).eq("id", params.attemptId);
}

async function getOrCreateHostedWebAttempt(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  const store = getStore();
  const cached = store.attemptsByRunId.get(params.run.id);
  const supabase = createSupabaseAdminClient();

  if (!supabase && cached) {
    return cached;
  }

  const existing = await findExistingHostedWebAttempt(params);
  if (existing) {
    store.attemptsByRunId.set(params.run.id, existing);
    return existing;
  }

  const { suiteSlug, suiteVersion, sessionDefinitions } = normalizeSessionDefinitions(params.benchmarkCase);
  const localAttempt: HostedWebAttempt = {
    id: supabase ? null : `${params.run.id}:local-hosted-suite`,
    suiteSlug,
    suiteVersion,
    sessionDefinitions,
    metadata: {},
  };
  store.attemptsByRunId.set(params.run.id, localAttempt);
  return localAttempt;
}

async function createHostedWebSession(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
  attempt: HostedWebAttempt;
  session: HostedWebSuiteSession;
}) {
  const baseUrl = getHostedSitesBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: params.run.id,
        caseId: params.benchmarkCase.id,
        attemptId: params.attempt.id ?? null,
        callbackSecret: process.env.RUNNER_SHARED_SECRET ?? null,
        suiteSlug: params.attempt.suiteSlug,
        suiteVersion: params.attempt.suiteVersion,
        app: params.session.app,
        taskSlug: params.session.taskSlug,
        taskVersion: params.session.taskVersion,
        sequenceIndex: params.session.sequenceIndex,
        weight: params.session.weight,
        required: params.session.required,
        title: params.session.title ?? null,
        goal: params.session.goal ?? null,
        startPath: params.session.startPath ?? null,
        seedVersion: params.session.seedVersion ?? null,
        metadata: params.session.metadata ?? {},
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new HostedWebSessionError({
      message: "Hosted benchmark site is not reachable. Check HOSTED_SITES_URL and the hosted-sites deployment.",
      hostedSitesUrl: baseUrl,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new HostedWebSessionError({
      message: `Hosted benchmark site rejected session creation with HTTP ${response.status}.`,
      status: response.status >= 500 ? 502 : 400,
      hostedSitesUrl: baseUrl,
      retryable: response.status >= 500,
    });
  }

  const session = (await response.json()) as HostedWebSessionConnection;
  return {
    ...session,
    token: session.token,
    status: "created" as HostedSessionStatus,
  };
}

type HostedAttemptInitResponse = {
  attemptId: string;
  suiteSlug: string;
  suiteVersion: string;
  metadata: Record<string, unknown>;
  sessions: HostedWebSessionConnection[];
};

async function initializeHostedWebAttempt(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
  attempt: HostedWebAttempt;
}) {
  const baseUrl = getHostedOrchestratorBaseUrl();
  const runnerSecret = runnerSecretOrThrow();
  const requestUrl = resolveHostedUrl(baseUrl, "/api/attempts/init");

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-runner-secret": runnerSecret,
      },
      body: JSON.stringify({
        runId: params.run.id,
        caseId: params.benchmarkCase.id,
        callbackSecret: runnerSecret,
        suiteSlug: params.attempt.suiteSlug,
        suiteVersion: params.attempt.suiteVersion,
        sessions: params.attempt.sessionDefinitions.map((session) => ({
          app: session.app,
          taskSlug: session.taskSlug,
          taskVersion: session.taskVersion,
          sequenceIndex: session.sequenceIndex,
          weight: session.weight,
          required: session.required,
          title: session.title ?? null,
          goal: session.goal ?? null,
          startPath: session.startPath ?? null,
          seedVersion: session.seedVersion ?? null,
          metadata: session.metadata ?? {},
        })),
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new HostedWebSessionError({
      message:
        "Hosted orchestrator is not reachable. Check HOSTED_ORCHESTRATOR_URL and the hosted-orchestrator deployment.",
      hostedSitesUrl: requestUrl,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new HostedWebSessionError({
      message: `Hosted orchestrator rejected attempt initialization with HTTP ${response.status}.`,
      status: response.status >= 500 ? 502 : 400,
      hostedSitesUrl: requestUrl,
      retryable: response.status >= 500,
    });
  }

  const initialized = (await response.json()) as HostedAttemptInitResponse;
  return {
    attempt: {
      ...params.attempt,
      id: initialized.attemptId,
      suiteSlug: initialized.suiteSlug,
      suiteVersion: initialized.suiteVersion,
      metadata: initialized.metadata,
    } satisfies HostedWebAttempt,
    sessions: initialized.sessions.map((session) => ({
      ...session,
      token: session.token,
      status: session.status,
    })),
  };
}

export async function getOrCreateHostedWebAttemptConnection(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  const attempt = await getOrCreateHostedWebAttempt(params);
  if (!attempt) {
    return null;
  }

  if (attempt.id) {
    const attemptState = await fetchHostedAttemptState(attempt.id);
    if (attemptState && attemptState.sessions.length === attempt.sessionDefinitions.length) {
      const sessions = attemptState.sessions.map((session) => ({
        sessionId: session.id,
        attemptId: attempt.id,
        token: session.token,
        app: session.app,
        taskSlug: session.taskSlug,
        taskVersion:
          attempt.sessionDefinitions.find((definition) => definition.sequenceIndex === session.sequenceIndex)
            ?.taskVersion ?? "v1",
        sequenceIndex: session.sequenceIndex,
        weight:
          attempt.sessionDefinitions.find((definition) => definition.sequenceIndex === session.sequenceIndex)
            ?.weight ?? 1,
        required:
          attempt.sessionDefinitions.find((definition) => definition.sequenceIndex === session.sequenceIndex)
            ?.required ?? true,
        startUrl: `${getHostedSitesBaseUrl()}${session.startPath ?? (session.app === "wiki-lite" ? "/wiki" : "/shopping")}?session=${encodeURIComponent(session.token)}`,
        goal: session.goal,
        title: session.title,
        status: session.status,
      }) satisfies HostedWebSessionConnection);

      return toAttemptConnection({
        attempt: {
          ...attempt,
          metadata: {
            ...attempt.metadata,
            activeSessionId: attemptState.activeSessionId,
            activeSequenceIndex: attemptState.activeSequenceIndex,
            completedSessionIds: attemptState.completedSessionIds,
          },
        },
        sessions,
      });
    }

    const existingSessions = await listExistingHostedWebSessions(attempt.id);
    if (existingSessions.length === attempt.sessionDefinitions.length) {
      return toAttemptConnection({ attempt, sessions: existingSessions });
    }

    if (createSupabaseAdminClient()) {
      throw new HostedWebSessionError({
        message: "Hosted attempt exists but could not be recovered from orchestrator or database state.",
        hostedSitesUrl: getHostedOrchestratorBaseUrl(),
        retryable: true,
        status: 502,
      });
    }
  }

  if (!attempt.id && createSupabaseAdminClient()) {
    const initialized = await initializeHostedWebAttempt({
      ...params,
      attempt,
    });
    getStore().attemptsByRunId.set(params.run.id, initialized.attempt);
    return toAttemptConnection(initialized);
  }

  // Local non-DB fallback only. DB-backed hosted runs should always initialize via orchestrator APIs.
  const sessions = await Promise.all(
    attempt.sessionDefinitions.map((session) =>
      createHostedWebSession({
        run: params.run,
        benchmarkCase: params.benchmarkCase,
        attempt,
        session,
      }),
    ),
  );

  if (attempt.id) {
    await persistAttemptState({
      attemptId: attempt.id,
      attempt,
      sessions,
    });
  }

  return toAttemptConnection({ attempt, sessions });
}
