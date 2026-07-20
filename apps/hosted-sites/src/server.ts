import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { hostname } from "node:os";
import {
  isTerminalHostedSessionStatus,
  type HostedAttemptOverviewSession,
  type HostedSession,
} from "./runtime/types.js";
import { redirect, readForm, readJson, sendJson, notFound, badRequest } from "./runtime/http.js";
import { createAttemptsRoutes } from "./routes/attempts.js";
import { createApiRoutes } from "./routes/api.js";
import { createRoutes } from "./routes/index.js";
import {
  buildFinalState,
  buildInitialSessionState,
  createAppRouteHandlers,
  defaultGoalForSession,
  defaultStartPathForApp,
  evaluateSession,
  extractHostedAppState,
  hydrateHostedAppState,
  resolveHostedAppId,
} from "./runtime/app-registry.js";
import { createOrchestratorClient } from "./runtime/orchestrator-client.js";
import { createRedisSessionCache } from "./runtime/session-cache.js";
import { createSessionStore } from "./runtime/session-store.js";
import { createTelemetryRuntime } from "./runtime/telemetry.js";
import { isHostedViewerMutation } from "./runtime/viewer-access.js";
import { parseScorePreviewMode, sanitizeScoreResult } from "./runtime/score-preview-policy.js";
import {
  observeDeterministicFault,
  renderRecoverableFault,
} from "./runtime/deterministic-faults.js";

const port = Number(process.env.HOSTED_SITES_PORT ?? 3003);
const publicBaseUrl = process.env.HOSTED_SITES_PUBLIC_URL ?? `http://localhost:${port}`;
const orchestratorBaseUrl = process.env.HOSTED_ORCHESTRATOR_URL ?? "http://localhost:3004";
const agentbenchWebUrl = process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000";
const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET;
const viewerTokenSecret = process.env.HOSTED_VIEWER_SECRET ?? runnerSharedSecret;
const instanceId = process.env.HOSTED_SITES_INSTANCE_ID ?? `${hostname()}:${process.pid}`;
const redisUrl = process.env.HOSTED_SESSION_REDIS_URL;
const sessionRedisTtlMs = Number(process.env.HOSTED_SESSION_REDIS_TTL_MS ?? 1000 * 60 * 60 * 6);
const scorePreviewMode = parseScorePreviewMode(process.env.HOSTED_SCORE_PREVIEW_MODE);

const sessions = new Map<string, HostedSession>();
const sessionCache = redisUrl
  ? createRedisSessionCache({
      url: redisUrl,
      defaultTtlMs: Number.isFinite(sessionRedisTtlMs) && sessionRedisTtlMs > 0 ? sessionRedisTtlMs : 1000 * 60 * 60 * 6,
    })
  : null;

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function clientIp(request: IncomingMessage) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof raw === "string" && raw.length > 0) {
    return raw.split(",")[0]?.trim() ?? null;
  }
  return typeof request.socket.remoteAddress === "string" ? request.socket.remoteAddress : null;
}

function clientUserAgent(request: IncomingMessage) {
  return typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null;
}

const orchestratorClient = createOrchestratorClient({
  baseUrl: orchestratorBaseUrl,
  runnerSharedSecret,
  buildFinalState,
});

const sessionStore = createSessionStore({
  sessions,
  sessionCache,
  publicBaseUrl,
  now,
  makeId,
  viewerTokenSecret,
  scorePreviewMode,
  recoverSession: orchestratorClient.recoverSession,
  persistSessionSnapshotDurably: orchestratorClient.persistSessionSnapshot,
  persistSessionAccess: orchestratorClient.recordSessionAccess,
  defaultStartPathForApp,
  defaultGoalForSession,
  resolveHostedAppId,
  buildInitialSessionState,
  extractHostedAppState,
  hydrateHostedAppState,
  clientIp,
  clientUserAgent,
  onSessionExpired: orchestratorClient.timeoutAttempt,
});

const {
  createHostedSession,
  getSession: loadSession,
  getSessionByToken,
  persistSessionSnapshot,
  markSessionTerminal,
} = sessionStore;
const requestSessionCache = new WeakMap<IncomingMessage, Promise<HostedSession | null>>();

async function getSession(url: URL, request: IncomingMessage) {
  const cached = requestSessionCache.get(request);
  if (cached) return cached;

  const pending = loadSession(url, request);
  requestSessionCache.set(request, pending);
  return pending;
}
const telemetryRuntime = createTelemetryRuntime({
  now,
  agentbenchWebUrl,
  runnerSharedSecret,
  persistSessionSnapshot,
  persistHostedEvent: orchestratorClient.recordHostedEvent,
});
const { recordEvent, forwardRunEvent, telemetryRunEventType } = telemetryRuntime;
const {
  completeSession: completeSessionViaOrchestrator,
  getSessionResult: getSessionResultViaOrchestrator,
  resolveAdvance: resolveAdvanceViaOrchestrator,
} = orchestratorClient;

async function completeSession(session: HostedSession, result: ReturnType<typeof evaluateSession>) {
  const persistedResult = await completeSessionViaOrchestrator(session, result);
  if (persistedResult) {
    await markSessionTerminal(session, persistedResult);
  }
  return persistedResult;
}

async function resolveSessionResult(session: HostedSession) {
  if (isTerminalHostedSessionStatus(session.status)) {
    const persistedResult = await getSessionResultViaOrchestrator(session);
    if (persistedResult) {
      return sanitizeScoreResult(persistedResult, session);
    }
    throw new Error("Persisted terminal session result is unavailable.");
  }
  return sanitizeScoreResult(evaluateSession(session), session);
}

function rejectTerminalMutation(session: HostedSession, response: ServerResponse) {
  if (!isTerminalHostedSessionStatus(session.status)) {
    return false;
  }
  sendJson(response, 409, { error: "session_terminal", status: session.status });
  return true;
}

function isSessionAppPath(session: HostedSession, pathname: string) {
  const rootSegment = depsPathRoot(defaultStartPathForApp(session.app));
  return pathname === rootSegment || pathname.startsWith(`${rootSegment}/`);
}

function depsPathRoot(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ? `/${segment}` : "/";
}

const attemptsRoutes = createAttemptsRoutes({
  getSession,
  resolveAdvance: resolveAdvanceViaOrchestrator,
  badRequest,
});

const apiRoutes = createApiRoutes({
  publicBaseUrl,
  createHostedSession,
  getSession,
  getSessionByToken,
  recordEvent,
  forwardRunEvent,
  telemetryRunEventType,
  evaluateSession,
  completeSession,
  resolveSessionResult,
  rejectTerminalMutation,
  readJson,
  badRequest,
  notFound,
});

const appRouteHandlers = createAppRouteHandlers({
  publicBaseUrl,
  defaultStartPathForApp,
  now,
  makeId,
  getSession,
  persistSessionSnapshot,
  recordEvent,
  forwardRunEvent,
  completeSession,
  evaluateSession,
  resolveSessionResult,
  rejectTerminalMutation,
  readForm,
  badRequest,
  notFound,
});

const routes = createRoutes({
  handlers: [
    apiRoutes.handle,
    attemptsRoutes.handle,
    ...appRouteHandlers,
  ],
  notFound,
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    const requestToken = url.searchParams.get("session");
    if (isHostedViewerMutation(request.method, requestToken, viewerTokenSecret)) {
      sendJson(response, 403, { error: "Viewer sessions are read-only" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "hosted-sites",
        instanceId,
        pid: process.pid,
        sessionCache: sessionCache ? "redis" : "memory",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      const session = await createHostedSession({});
      await recordEvent(session, {
        type: "session.created",
        taskSlug: session.taskSlug,
        runId: session.runId,
      });
      redirect(response, `/shopping?session=${encodeURIComponent(session.token)}`);
      return;
    }

    if (requestToken && (request.method === "GET" || request.method === "POST")) {
      const session = await getSession(url, request);
      if (
        session
        && session.accessMode !== "viewer"
        && session.status === "active"
        && isSessionAppPath(session, url.pathname)
      ) {
        const observation = observeDeterministicFault(
          session.metadata,
          request.method === "POST" ? ["mutation"] : ["navigation", "read"],
        );
        if (observation.injected) {
          await recordEvent(session, {
            type: "scenario.fault_applied",
            kind: observation.injected.kind,
          });
          renderRecoverableFault(response, observation.injected.kind, `${url.pathname}${url.search}`);
          return;
        }
        if (observation.recovered) {
          await recordEvent(session, {
            type: "scenario.fault_recovered",
            kind: observation.recovered.kind,
          });
        } else if (observation.changed) {
          await persistSessionSnapshot(session);
        }
      }
    }

    if (await routes.handle(request, response, url)) {
      return;
    }
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

server.listen(port, () => {
  console.log(`[hosted-sites] listening on ${publicBaseUrl} (${instanceId})`);
});
