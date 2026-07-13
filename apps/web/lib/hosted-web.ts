import type {
  BenchmarkCase,
  BenchmarkRun,
  HostedAttemptConnectionSnapshot,
  HostedWebSuiteSession,
} from "@agentbench/protocol";
import { hostedAttemptConnectionSnapshotSchema } from "@agentbench/protocol";
import { buildHostedAttemptReadModel } from "@agentbench/shared";

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
  timeLimitMinutes: number | null;
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
  caseRevisionId: string | null;
  suiteSlug: string;
  suiteVersion: string;
  sessionDefinitions: HostedWebSuiteSession[];
  metadata: Record<string, unknown>;
};

function normalizeHostedSessionStatus(status: HostedAttemptConnectionSnapshot["sessions"][number]["status"]): HostedSessionStatus {
  if (status === "completed" || status === "failed" || status === "expired") {
    return status;
  }
  if (status === "active" || status === "scoring") {
    return "active";
  }
  return "created";
}

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
    timeLimitMinutes:
      typeof params.attempt.metadata.timeLimitMinutesPerTestcase === "number" &&
      Number.isFinite(params.attempt.metadata.timeLimitMinutesPerTestcase)
        ? params.attempt.metadata.timeLimitMinutesPerTestcase
        : null,
    orchestratorUrl: activeSession?.startUrl ?? null,
    advanceUrl:
      activeSession?.token
        ? `${baseUrl}/api/sessions/advance?session=${encodeURIComponent(activeSession.token)}`
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

export type HostedSessionDeadline = {
  sessionId: string;
  taskSlug: string;
  status: string;
  sequenceIndex: number;
  expiresAt: string | null;
  timeLimitMinutes: number | null;
};

export async function listHostedSessionDeadlines(runId: string): Promise<HostedSessionDeadline[]> {
  const result = await fetchHostedOrchestrator<{ sessions: HostedSessionDeadline[] }>(
    `/api/runs/${encodeURIComponent(runId)}/sessions`,
  );
  if (!result) throw new Error("Failed to load hosted session deadlines");
  return result.sessions;
}

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

async function getOrCreateHostedWebAttempt(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  if (!params.benchmarkCase.currentRevisionId) {
    throw new Error("Hosted benchmark case has no current revision.");
  }
  return {
    id: null,
    caseRevisionId: params.benchmarkCase.currentRevisionId,
    suiteSlug: params.benchmarkCase.slug,
    suiteVersion: "current",
    sessionDefinitions: [],
    metadata: {},
  } satisfies HostedWebAttempt;
}

export async function recoverExistingHostedWebAttemptConnection(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  const baseUrl = getHostedOrchestratorBaseUrl();
  const requestUrl = new URL(resolveHostedUrl(baseUrl, "/api/attempts/connection"));
  requestUrl.searchParams.set("runId", params.run.id);
  requestUrl.searchParams.set("caseId", params.benchmarkCase.id);
  requestUrl.searchParams.set("caseRevisionId", params.benchmarkCase.currentRevisionId ?? "");

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        "x-runner-secret": runnerSecretOrThrow(),
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new HostedWebSessionError({
      message: "Hosted orchestrator is not reachable while recovering an existing attempt.",
      hostedSitesUrl: requestUrl.toString(),
      cause: error,
    });
  }

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new HostedWebSessionError({
      message: `Hosted orchestrator rejected attempt recovery with HTTP ${response.status}.`,
      status: response.status >= 500 ? 502 : response.status,
      hostedSitesUrl: requestUrl.toString(),
      retryable: response.status >= 500,
    });
  }

  const snapshot = hostedAttemptConnectionSnapshotSchema.parse(await response.json());
  return toAttemptConnection({
    attempt: {
      id: snapshot.attemptId,
      caseRevisionId: params.benchmarkCase.currentRevisionId,
      suiteSlug: snapshot.suiteSlug,
      suiteVersion: snapshot.suiteVersion,
      sessionDefinitions: [],
      metadata: snapshot.metadata,
    },
    sessions: snapshot.sessions.map((session) => ({
      ...session,
      status: normalizeHostedSessionStatus(session.status),
    })),
  });
}

type HostedAttemptInitResponse = {
  attemptId: string;
  suiteSlug: string;
  suiteVersion: string;
  metadata: Record<string, unknown>;
  sessions: HostedWebSessionConnection[];
};

export function buildHostedAttemptInitPayload(params: {
  runId: string;
  caseId: string;
  caseRevisionId: string | null;
  callbackSecret: string;
}) {
  return {
    runId: params.runId,
    caseId: params.caseId,
    caseRevisionId: params.caseRevisionId,
    callbackSecret: params.callbackSecret,
  };
}

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
      body: JSON.stringify(buildHostedAttemptInitPayload({
        runId: params.run.id,
        caseId: params.benchmarkCase.id,
        caseRevisionId: params.attempt.caseRevisionId,
        callbackSecret: runnerSecret,
      })),
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
  if (!attempt.caseRevisionId) {
    throw new HostedWebSessionError({
      message: "Hosted benchmark case has no published revision.",
      hostedSitesUrl: getHostedOrchestratorBaseUrl(),
      retryable: false,
      status: 409,
    });
  }
  const existing = await recoverExistingHostedWebAttemptConnection(params);
  if (existing) {
    return existing;
  }
  const initialized = await initializeHostedWebAttempt({
    ...params,
    attempt,
  });
  return toAttemptConnection(initialized);
}
