import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { hostname } from "node:os";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HostedAttemptOverviewSession, HostedSession } from "./runtime/types.js";
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
} from "./runtime/app-registry.js";
import { createOrchestratorClient } from "./runtime/orchestrator-client.js";
import { createRedisSessionCache } from "./runtime/session-cache.js";
import { createSessionStore } from "./runtime/session-store.js";
import { createTelemetryRuntime } from "./runtime/telemetry.js";

const port = Number(process.env.HOSTED_SITES_PORT ?? 3003);
const publicBaseUrl = process.env.HOSTED_SITES_PUBLIC_URL ?? `http://localhost:${port}`;
const orchestratorBaseUrl = process.env.HOSTED_ORCHESTRATOR_URL ?? "http://localhost:3004";
const agentbenchWebUrl = process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000";
const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const instanceId = process.env.HOSTED_SITES_INSTANCE_ID ?? `${hostname()}:${process.pid}`;
const redisUrl = process.env.HOSTED_SESSION_REDIS_URL ?? process.env.REDIS_URL;
const sessionRedisTtlMs = Number(process.env.HOSTED_SESSION_REDIS_TTL_MS ?? 1000 * 60 * 60 * 6);

const sessions = new Map<string, HostedSession>();
let supabaseAdmin: SupabaseClient | null | undefined;
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

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
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

function clientReferer(request: IncomingMessage) {
  return typeof request.headers.referer === "string" ? request.headers.referer : null;
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
  hashToken,
  getSupabaseAdmin,
  defaultStartPathForApp,
  defaultGoalForSession,
  buildInitialSessionState,
  clientIp,
  clientUserAgent,
  clientReferer,
  onSessionExpired: orchestratorClient.timeoutAttempt,
});

const { createHostedSession, getSession, getSessionByToken, persistSessionSnapshot } = sessionStore;
const telemetryRuntime = createTelemetryRuntime({
  now,
  agentbenchWebUrl,
  runnerSharedSecret,
  getSupabaseAdmin,
  persistSessionSnapshot,
});
const { recordEvent, forwardRunEvent, telemetryRunEventType } = telemetryRuntime;
const {
  completeSession: completeSessionViaOrchestrator,
  getAttemptOverview: getAttemptOverviewViaOrchestrator,
  resolveAdvance: resolveAdvanceViaOrchestrator,
} = orchestratorClient;

const attemptsRoutes = createAttemptsRoutes({
  publicBaseUrl,
  defaultStartPathForApp,
  getSession,
  getAttemptOverview: getAttemptOverviewViaOrchestrator,
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
  completeSession: completeSessionViaOrchestrator,
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
  completeSession: completeSessionViaOrchestrator,
  evaluateSession,
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
