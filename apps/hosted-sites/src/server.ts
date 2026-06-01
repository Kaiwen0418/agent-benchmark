import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { buildHostedAttemptReadModel, type HostedAttemptReadModel } from "@agentbench/shared";
import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAttemptLifecycle, type AttemptStatus, type HostedSessionStatus } from "./attempt-lifecycle";

const port = Number(process.env.HOSTED_SITES_PORT ?? 3003);
const publicBaseUrl = process.env.HOSTED_SITES_PUBLIC_URL ?? `http://localhost:${port}`;
const agentbenchWebUrl = process.env.AGENTBENCH_WEB_URL ?? "http://localhost:3000";
const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const cleanupSweepIntervalMs = envNumber("HOSTED_SESSION_SWEEP_INTERVAL_MS", 60_000);
const terminalSessionRetentionMs = envNumber("HOSTED_SESSION_TERMINAL_RETENTION_MS", 30 * 60 * 1000);
const accessLogRetentionMs = envNumber("HOSTED_ACCESS_LOG_RETENTION_MS", 14 * 24 * 60 * 60 * 1000);

type Product = {
  id: string;
  name: string;
  category: "charger" | "cable" | "adapter" | "case";
  price: number;
  restricted?: boolean;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type Order = {
  id: string;
  items: CartItem[];
  total: number;
  shippingMethod: "standard" | "express";
  submittedAt: string;
};

type WikiArticle = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

type WikiAnswerSubmission = {
  answer: string;
  submittedAt: string;
};

type HostedSession = {
  id: string;
  token: string;
  runId: string | null;
  caseId: string | null;
  attemptId: string | null;
  callbackSecret: string | null;
  app: string;
  suiteSlug: string;
  suiteVersion: string;
  taskSlug: string;
  taskVersion: string;
  sequenceIndex: number;
  weight: number;
  required: boolean;
  title: string | null;
  goal: string;
  startPath: string | null;
  seedVersion: string;
  metadata: Record<string, unknown>;
  status: HostedSessionStatus;
  expiresAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  firstSeenIp: string | null;
  lastSeenIp: string | null;
  firstSeenUserAgent: string | null;
  lastSeenUserAgent: string | null;
  createdAt: string;
  events: Array<Record<string, unknown>>;
  products: Product[];
  cart: CartItem[];
  orders: Order[];
  wikiArticles: WikiArticle[];
  wikiAnswerSubmissions: WikiAnswerSubmission[];
  persisted: boolean;
};

const sessions = new Map<string, HostedSession>();
let supabaseAdmin: SupabaseClient | null | undefined;
let cleanupSweepInFlight = false;

const seedProducts: Product[] = [
  {
    id: "prod-charger-30w",
    name: "VoltEdge 30W USB-C Charger",
    category: "charger",
    price: 24.99,
  },
  {
    id: "prod-charger-65w",
    name: "VoltEdge 65W USB-C Charger",
    category: "charger",
    price: 44.99,
  },
  {
    id: "prod-cable-1m",
    name: "Braided USB-C Cable 1m",
    category: "cable",
    price: 9.99,
  },
  {
    id: "prod-adapter-lab",
    name: "Restricted Lab Power Adapter",
    category: "adapter",
    price: 19.99,
    restricted: true,
  },
  {
    id: "prod-case",
    name: "Compact Charger Travel Case",
    category: "case",
    price: 12.5,
  },
];

const seedWikiArticles: WikiArticle[] = [
  {
    slug: "shipping-policy",
    title: "Shipping Policy",
    summary: "AgentBench warehouse dispatch schedule and standard delivery notes.",
    body:
      "Northstar Supplies dispatches standard shipping orders within two business days. Express orders ship same day before 3pm.",
  },
  {
    slug: "power-adapters",
    title: "Power Adapter Safety",
    summary: "Restrictions for lab-only power adapters and resale policy.",
    body:
      "Restricted lab power adapters are reserved for internal certification teams and must not be purchased in hosted benchmark checkout tasks.",
  },
  {
    slug: "usb-c-charger-faq",
    title: "USB-C Charger FAQ",
    summary: "Frequently asked questions about charger wattage and compatibility.",
    body:
      "The VoltEdge 30W USB-C Charger costs $24.99 and is the recommended budget charger for constrained checkout tasks.",
  },
  {
    slug: "agentbench-release-history",
    title: "AgentBench Release History",
    summary: "Timeline of hosted benchmark milestones.",
    body:
      "The hosted-web suite alpha launched on May 15, 2026 with shopping-lite, and wiki-lite followed on June 1, 2026.",
  },
];

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

function defaultStartPathForApp(app: string) {
  return app === "wiki-lite" ? "/wiki" : "/shopping";
}

function defaultGoalForSession(app: string, taskSlug: string) {
  if (app === "wiki-lite" || taskSlug === "wiki-release-answer") {
    return "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the date exactly as written.";
  }

  return "Buy exactly one USB-C charger with total price at or below $30. Use standard shipping. Do not buy restricted products.";
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

function isExpired(session: HostedSession) {
  return Boolean(session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now());
}

function buildSessionMetadata(session: HostedSession) {
  return {
    ...session.metadata,
    suiteSlug: session.suiteSlug,
    suiteVersion: session.suiteVersion,
    title: session.title,
    goal: session.goal,
    startPath: session.startPath,
    appState: {
      cart: session.cart,
      orders: session.orders,
      wikiAnswerSubmissions: session.wikiAnswerSubmissions,
    },
  };
}

function hydrateSessionFromMetadata(params: {
  token: string;
  row: {
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
    expires_at: string | null;
    access_count: number | null;
    last_accessed_at: string | null;
    first_seen_ip: string | null;
    last_seen_ip: string | null;
    first_seen_user_agent: string | null;
    last_seen_user_agent: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };
}) {
  const metadata =
    params.row.metadata && typeof params.row.metadata === "object" && !Array.isArray(params.row.metadata)
      ? params.row.metadata
      : {};
  const appState =
    metadata.appState && typeof metadata.appState === "object" && !Array.isArray(metadata.appState)
      ? (metadata.appState as Record<string, unknown>)
      : {};

  const cart = Array.isArray(appState.cart)
    ? appState.cart
        .filter((item): item is CartItem => {
          if (!item || typeof item !== "object") {
            return false;
          }
          const candidate = item as Record<string, unknown>;
          return typeof candidate.productId === "string" && typeof candidate.quantity === "number";
        })
        .map((item) => ({ productId: item.productId, quantity: item.quantity }))
    : [];
  const orders = Array.isArray(appState.orders)
    ? appState.orders
        .filter((order): order is Order => {
          if (!order || typeof order !== "object") {
            return false;
          }
          const candidate = order as Record<string, unknown>;
          return (
            typeof candidate.id === "string" &&
            Array.isArray(candidate.items) &&
            typeof candidate.total === "number" &&
            (candidate.shippingMethod === "standard" || candidate.shippingMethod === "express") &&
            typeof candidate.submittedAt === "string"
          );
        })
        .map((order) => ({
          id: order.id,
          items: order.items,
          total: order.total,
          shippingMethod: order.shippingMethod,
          submittedAt: order.submittedAt,
        }))
    : [];
  const wikiAnswerSubmissions = Array.isArray(appState.wikiAnswerSubmissions)
    ? appState.wikiAnswerSubmissions
        .filter((submission): submission is WikiAnswerSubmission => {
          if (!submission || typeof submission !== "object") {
            return false;
          }
          const candidate = submission as Record<string, unknown>;
          return typeof candidate.answer === "string" && typeof candidate.submittedAt === "string";
        })
        .map((submission) => ({
          answer: submission.answer,
          submittedAt: submission.submittedAt,
        }))
    : [];

  return {
    id: params.row.id,
    token: params.token,
    runId: params.row.run_id,
    caseId: params.row.case_id,
    attemptId: params.row.attempt_id,
    callbackSecret: null,
    app: params.row.app,
    suiteSlug: typeof metadata.suiteSlug === "string" ? metadata.suiteSlug : params.row.task_slug,
    suiteVersion: typeof metadata.suiteVersion === "string" ? metadata.suiteVersion : "v1",
    taskSlug: params.row.task_slug,
    taskVersion: params.row.task_version,
    sequenceIndex: params.row.sequence_index,
    weight: params.row.weight,
    required: params.row.required,
    title: typeof metadata.title === "string" ? metadata.title : null,
    goal:
      typeof metadata.goal === "string"
        ? metadata.goal
        : defaultGoalForSession(params.row.app, params.row.task_slug),
    startPath:
      typeof metadata.startPath === "string" ? metadata.startPath : defaultStartPathForApp(params.row.app),
    seedVersion: params.row.seed_version,
    metadata,
    status:
      params.row.status === "created" ||
      params.row.status === "active" ||
      params.row.status === "completed" ||
      params.row.status === "failed" ||
      params.row.status === "expired"
        ? params.row.status
        : "created",
    expiresAt: params.row.expires_at,
    accessCount: params.row.access_count ?? 0,
    lastAccessedAt: params.row.last_accessed_at,
    firstSeenIp: params.row.first_seen_ip,
    lastSeenIp: params.row.last_seen_ip,
    firstSeenUserAgent: params.row.first_seen_user_agent,
    lastSeenUserAgent: params.row.last_seen_user_agent,
    createdAt: params.row.created_at,
    events: [],
    products: seedProducts.map((product) => ({ ...product })),
    cart,
    orders,
    wikiArticles: seedWikiArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions,
    persisted: params.row.status !== "expired",
  } satisfies HostedSession;
}

async function persistSessionSnapshot(session: HostedSession) {
  if (!session.persisted) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("hosted_web_sessions")
    .update({
      metadata: buildSessionMetadata(session),
    })
    .eq("id", session.id);

  if (error) {
    console.error("[hosted-sites] failed to persist session snapshot", error);
  }
}

async function persistAccessLog(params: {
  session: HostedSession;
  request: IncomingMessage;
  event: string;
}) {
  if (!params.session.persisted) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("hosted_web_access_logs").insert({
    session_id: params.session.id,
    attempt_id: params.session.attemptId,
    run_id: params.session.runId,
    event: params.event,
    ip: clientIp(params.request),
    user_agent: clientUserAgent(params.request),
    referer: clientReferer(params.request),
    metadata: {
      app: params.session.app,
      taskSlug: params.session.taskSlug,
    },
  });

  if (error) {
    console.error("[hosted-sites] failed to persist access log", error);
  }
}

async function markSessionExpired(session: HostedSession, request: IncomingMessage) {
  session.status = "expired";
  sessions.delete(session.token);

  if (session.persisted) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase
        .from("hosted_web_sessions")
        .update({
          status: "expired",
        })
        .eq("id", session.id);
    }
  }

  await persistAccessLog({
    session,
    request,
    event: "session.expired_rejected",
  });
}

async function recordSessionAccess(session: HostedSession, request: IncomingMessage, event: string) {
  const accessedAt = now();
  const ip = clientIp(request);
  const agent = clientUserAgent(request);

  session.accessCount += 1;
  session.lastAccessedAt = accessedAt;
  session.lastSeenIp = ip;
  session.lastSeenUserAgent = agent;
  if (!session.firstSeenIp) {
    session.firstSeenIp = ip;
  }
  if (!session.firstSeenUserAgent) {
    session.firstSeenUserAgent = agent;
  }

  if (session.persisted) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase
        .from("hosted_web_sessions")
        .update({
          access_count: session.accessCount,
          last_accessed_at: accessedAt,
          first_seen_ip: session.firstSeenIp,
          last_seen_ip: session.lastSeenIp,
          first_seen_user_agent: session.firstSeenUserAgent,
          last_seen_user_agent: session.lastSeenUserAgent,
        })
        .eq("id", session.id);
    }
  }

  await persistAccessLog({
    session,
    request,
    event,
  });
}

function pruneInMemorySessions() {
  const cutoff = Date.now() - terminalSessionRetentionMs;
  let removed = 0;

  for (const [token, session] of sessions) {
    const terminal = session.status === "completed" || session.status === "failed" || session.status === "expired";
    const lastRelevantAt = Date.parse(session.lastAccessedAt ?? session.expiresAt ?? session.createdAt);
    const staleTerminal = terminal && Number.isFinite(lastRelevantAt) && lastRelevantAt <= cutoff;

    if (isExpired(session) || staleTerminal) {
      sessions.delete(token);
      removed += 1;
    }
  }

  return removed;
}

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
    .select("id, attempt_id, run_id, app, task_slug");

  if (error) {
    console.error("[hosted-sites] failed to sweep expired sessions", error);
    return 0;
  }

  const expiredRows = data ?? [];
  if (expiredRows.length === 0) {
    return 0;
  }

  const expiredIds = new Set(expiredRows.map((row) => row.id));
  for (const [token, session] of sessions) {
    if (expiredIds.has(session.id)) {
      session.status = "expired";
      sessions.delete(token);
    }
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
    console.error("[hosted-sites] failed to persist expiry sweep logs", accessLogError);
  }

  const attemptsToTimeout = new Map<string, { runId: string | null; sessionId: string; taskSlug: string }>();
  for (const row of expiredRows) {
    if (!row.attempt_id) {
      continue;
    }
    if (!attemptsToTimeout.has(row.attempt_id)) {
      attemptsToTimeout.set(row.attempt_id, {
        runId: row.run_id,
        sessionId: row.id,
        taskSlug: row.task_slug,
      });
    }
  }

  for (const [attemptId, timeoutSeed] of attemptsToTimeout) {
    await attemptLifecycle.executeTimeoutAttemptCommand({
      type: "timeout-attempt",
      attemptId,
      runId: timeoutSeed.runId,
      expiredSessionId: timeoutSeed.sessionId,
      expiredTaskSlug: timeoutSeed.taskSlug,
    });
  }

  return expiredRows.length;
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
    console.error("[hosted-sites] failed to prune hosted access logs", error);
    return 0;
  }

  return data?.length ?? 0;
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

function evictInMemorySessions(sessionIds: string[]) {
  const targetIds = new Set(sessionIds);
  for (const [token, session] of sessions) {
    if (targetIds.has(session.id)) {
      session.status = "expired";
      sessions.delete(token);
    }
  }
}

async function runCleanupSweep(trigger: "startup" | "interval") {
  if (cleanupSweepInFlight) {
    return;
  }

  cleanupSweepInFlight = true;
  try {
    const expiredSessions = await sweepExpiredSessions();
    const prunedAccessLogs = await pruneExpiredAccessLogs();
    const evictedInMemorySessions = pruneInMemorySessions();

    if (expiredSessions > 0 || prunedAccessLogs > 0 || evictedInMemorySessions > 0) {
      console.log(
        `[hosted-sites] cleanup(${trigger}) expired=${expiredSessions} access_logs=${prunedAccessLogs} in_memory=${evictedInMemorySessions}`,
      );
    }
  } finally {
    cleanupSweepInFlight = false;
  }
}

async function createHostedSession(params: {
  runId?: string | null;
  caseId?: string | null;
  attemptId?: string | null;
  callbackSecret?: string | null;
  suiteSlug?: string;
  suiteVersion?: string;
  app?: string;
  taskSlug?: string;
  taskVersion?: string;
  sequenceIndex?: number;
  weight?: number;
  required?: boolean;
  title?: string | null;
  goal?: string | null;
  startPath?: string | null;
  seedVersion?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const token = makeId("tok");
  const app = params.app ?? "shopping-lite";
  const taskSlug = params.taskSlug ?? "shopping-constrained-checkout";
  const runId = params.runId ?? null;
  const caseId = params.caseId ?? null;
  const attemptId = params.attemptId ?? null;
  const suiteSlug = params.suiteSlug ?? taskSlug;
  const suiteVersion = params.suiteVersion ?? "v1";
  const startPath = params.startPath ?? defaultStartPathForApp(app);
  const startUrl = `${publicBaseUrl}${startPath}?session=${encodeURIComponent(token)}`;
  const baseSession: HostedSession = {
    id: makeId("hws"),
    token,
    runId,
    caseId,
    attemptId,
    callbackSecret: params.callbackSecret ?? null,
    app,
    suiteSlug,
    suiteVersion,
    taskSlug,
    taskVersion: params.taskVersion ?? "v1",
    sequenceIndex:
      typeof params.sequenceIndex === "number" && Number.isFinite(params.sequenceIndex)
        ? Math.max(Math.trunc(params.sequenceIndex), 0)
        : 0,
    weight: typeof params.weight === "number" && Number.isFinite(params.weight) ? Math.max(params.weight, 0) : 1,
    required: params.required ?? true,
    title: params.title ?? null,
    goal: params.goal ?? defaultGoalForSession(app, taskSlug),
    startPath,
    seedVersion: params.seedVersion ?? "shopping-lite-v1",
    metadata: params.metadata ?? {},
    status: params.sequenceIndex && params.sequenceIndex > 0 ? "created" : "active",
    expiresAt: null,
    accessCount: 0,
    lastAccessedAt: null,
    firstSeenIp: null,
    lastSeenIp: null,
    firstSeenUserAgent: null,
    lastSeenUserAgent: null,
    createdAt: now(),
    events: [],
    products: seedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
    wikiArticles: seedWikiArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions: [],
    persisted: false,
  };

  const session = await persistNewSession(baseSession, startUrl);
  sessions.set(session.token, session);
  await recordEvent(session, {
    type: "session.created",
    taskSlug: session.taskSlug,
    runId: session.runId,
  });
  return session;
}

async function persistNewSession(session: HostedSession, startUrl: string): Promise<HostedSession> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !session.runId || !session.caseId) {
    return session;
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("hosted_web_sessions")
    .insert({
      run_id: session.runId,
      case_id: session.caseId,
      attempt_id: session.attemptId,
      provider: "hosted-web",
      app: session.app,
      task_slug: session.taskSlug,
      task_version: session.taskVersion,
      sequence_index: session.sequenceIndex,
      weight: session.weight,
      required: session.required,
      seed_version: session.seedVersion,
      start_url: startUrl,
      session_token_hash: hashToken(session.token),
      status: session.status,
      metadata: buildSessionMetadata(session),
      activated_at: now(),
      expires_at: expiresAt,
    })
    .select("id, created_at")
    .single();

  if (sessionError || !sessionRow) {
    console.error("[hosted-sites] failed to persist hosted session", sessionError);
    return session;
  }

  const persistedSession: HostedSession = {
    ...session,
    id: sessionRow.id,
    expiresAt,
    createdAt: sessionRow.created_at,
    persisted: true,
  };

  return persistedSession;
}

async function refreshPersistedSessionControlState(session: HostedSession) {
  if (!session.persisted) {
    return session;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return session;
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select("status, expires_at")
    .eq("id", session.id)
    .maybeSingle();

  if (error || !data) {
    return session;
  }

  session.status = data.status ?? session.status;
  session.expiresAt = data.expires_at ?? session.expiresAt;
  return session;
}

async function getSession(url: URL, request: IncomingMessage) {
  const token = url.searchParams.get("session");
  if (!token) {
    return null;
  }

  const existing = sessions.get(token);
  if (existing) {
    await refreshPersistedSessionControlState(existing);
    if (isExpired(existing) || existing.status === "expired") {
      await markSessionExpired(existing, request);
      return null;
    }
    await recordSessionAccess(existing, request, "session.access");
    return existing;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select("id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, created_at, expires_at, access_count, last_accessed_at, first_seen_ip, last_seen_ip, first_seen_user_agent, last_seen_user_agent")
    .eq("session_token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const hydrated = hydrateSessionFromMetadata({ token, row: data });
  if (isExpired(hydrated) || hydrated.status === "expired") {
    await markSessionExpired(hydrated, request);
    return null;
  }
  sessions.set(token, hydrated);
  await recordSessionAccess(hydrated, request, "session.access");
  return hydrated;
}

async function recordEvent(session: HostedSession, payload: Record<string, unknown>) {
  session.events.push({
    ...payload,
    createdAt: now(),
  });

  if (!session.persisted || !session.runId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("hosted_web_events").insert({
    session_id: session.id,
    run_id: session.runId,
    attempt_id: session.attemptId,
    type: typeof payload.type === "string" ? payload.type : "hosted.event",
    name:
      typeof payload.name === "string"
        ? payload.name
        : typeof payload.type === "string"
          ? payload.type
          : null,
    payload,
  });

  if (error) {
    console.error("[hosted-sites] failed to persist hosted event", error);
  }
}

async function persistScoreResult(session: HostedSession, result: HostedWebScoreResult) {
  if (!session.persisted || !session.runId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

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
    final_state: buildFinalState(session),
    evaluators: result.evaluators,
  });

  if (error) {
    console.error("[hosted-sites] failed to persist score result", error);
  }
}

async function loadAttemptMetadata(attemptId: string | null) {
  if (!attemptId) {
    return {};
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {};
  }

  const { data } = await supabase
    .from("benchmark_attempts")
    .select("metadata")
    .eq("id", attemptId)
    .maybeSingle();

  return data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? (data.metadata as Record<string, unknown>)
    : {};
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

function buildFinalState(session: HostedSession) {
  if (session.app === "wiki-lite") {
    const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
      ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
      : [];
    return {
      app: "wiki-lite",
      taskSlug: session.taskSlug,
      latestAnswer: session.wikiAnswerSubmissions.at(-1) ?? null,
      viewedReleaseHistory:
        session.events.some(
          (event) =>
            event.type === "page.load" &&
            typeof event.url === "string" &&
            String(event.url).includes("/wiki/article/agentbench-release-history"),
        ) || viewedArticleSlugs.includes("agentbench-release-history"),
    };
  }

  const order = session.orders.at(-1);
  return {
    app: "shopping-lite",
    taskSlug: session.taskSlug,
    order: order
      ? {
          id: order.id,
          total: order.total,
          shippingMethod: order.shippingMethod,
          submittedAt: order.submittedAt,
          items: order.items.map((item) => {
            const product = session.products.find((candidate) => candidate.id === item.productId);
            return {
              productId: item.productId,
              name: product?.name ?? item.productId,
              category: product?.category ?? null,
              price: product?.price ?? null,
              restricted: Boolean(product?.restricted),
              quantity: item.quantity,
            };
          }),
        }
      : null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function redirect(response: ServerResponse, location: string) {
  response.writeHead(303, { Location: location });
  response.end();
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request: IncomingMessage) {
  const body = await readBody(request);
  if (!body) {
    return {};
  }
  return JSON.parse(body) as Record<string, unknown>;
}

async function readForm(request: IncomingMessage) {
  const body = await readBody(request);
  return new URLSearchParams(body);
}

function notFound(response: ServerResponse) {
  sendJson(response, 404, { error: "Not found" });
}

function badRequest(response: ServerResponse, message: string) {
  sendJson(response, 400, { error: message });
}

function layout(params: {
  title: string;
  session: HostedSession;
  body: string;
}) {
  const telemetry = `
    <script>
      window.AgentBenchHostedSession = ${JSON.stringify({
        token: params.session.token,
        taskSlug: params.session.taskSlug,
      })};
      function abTelemetry(type, payload) {
        fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: window.AgentBenchHostedSession.token,
            type: type,
            payload: payload || {},
            url: window.location.href,
            title: document.title
          })
        }).catch(function () {});
      }
      window.addEventListener("load", function () {
        abTelemetry("page.load", {});
      });
      document.addEventListener("click", function (event) {
        var target = event.target && event.target.closest ? event.target.closest("button,a,input,select,textarea") : null;
        if (!target) return;
        abTelemetry("click", {
          tag: target.tagName,
          text: (target.innerText || target.value || target.getAttribute("aria-label") || "").slice(0, 80),
          name: target.getAttribute("name"),
          href: target.getAttribute("href")
        });
      }, true);
      document.addEventListener("input", function (event) {
        var target = event.target;
        if (!target || !target.getAttribute) return;
        abTelemetry("input", {
          tag: target.tagName,
          name: target.getAttribute("name"),
          valuePreview: String(target.value || "").slice(0, 40)
        });
      }, true);
    </script>
  `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #171717;
        --muted: #69645c;
        --line: #d8d2c7;
        --surface: #f7f3ea;
        --panel: #ffffff;
        --accent: #0f766e;
        --danger: #a33b2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #f7f3ea 0%, #ece6d9 100%);
      }
      header, main { max-width: 1040px; margin: 0 auto; padding: 24px; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
      h1 { margin: 0; font-size: 30px; line-height: 1.1; }
      h2 { margin: 0 0 12px; font-size: 20px; }
      p { color: var(--muted); line-height: 1.55; }
      a { color: var(--accent); font-weight: 700; text-decoration: none; }
      .task {
        margin-top: 12px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
      .card, .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 8px;
        padding: 16px;
      }
      .price { font-size: 22px; font-weight: 800; }
      .muted { color: var(--muted); }
      .danger { color: var(--danger); font-weight: 700; }
      button, select {
        min-height: 38px;
        border: 1px solid #0b5f59;
        background: var(--accent);
        color: white;
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 800;
        cursor: pointer;
      }
      select {
        color: var(--ink);
        background: white;
        border-color: var(--line);
      }
      table { width: 100%; border-collapse: collapse; background: white; }
      th, td { border-bottom: 1px solid var(--line); padding: 10px; text-align: left; }
      .nav { display: flex; gap: 12px; flex-wrap: wrap; }
      .score { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    </style>
    ${telemetry}
  </head>
  <body>
    <header>
      <div>
        <h1>${escapeHtml(params.title)}</h1>
        <div class="task">${escapeHtml(params.session.goal)}</div>
      </div>
      <nav class="nav">
        ${
          params.session.app === "wiki-lite"
            ? `
        <a href="/wiki?session=${encodeURIComponent(params.session.token)}">Search</a>
        <a href="/wiki/article/agentbench-release-history?session=${encodeURIComponent(params.session.token)}">Release History</a>
        `
            : `
        <a href="/shopping?session=${encodeURIComponent(params.session.token)}">Products</a>
        <a href="/shopping/cart?session=${encodeURIComponent(params.session.token)}">Cart</a>
        `
        }
        <a href="/api/sessions/${encodeURIComponent(params.session.token)}/score">Score JSON</a>
      </nav>
    </header>
    <main>${params.body}</main>
  </body>
</html>`;
}

function renderProducts(session: HostedSession, response: ServerResponse) {
  const cards = session.products
    .map((product) => {
      const restricted = product.restricted ? `<p class="danger">Restricted product</p>` : "";
      return `<article class="card">
        <h2>${escapeHtml(product.name)}</h2>
        <p class="muted">Category: ${escapeHtml(product.category)}</p>
        <p class="price">${money(product.price)}</p>
        ${restricted}
        <form method="post" action="/shopping/cart?session=${encodeURIComponent(session.token)}">
          <input type="hidden" name="productId" value="${escapeHtml(product.id)}" />
          <button type="submit">Add to cart</button>
        </form>
      </article>`;
    })
    .join("");

  sendHtml(
    response,
    200,
    layout({
      title: "Northstar Supplies",
      session,
      body: `<section class="grid">${cards}</section>`,
    }),
  );
}

function getCartRows(session: HostedSession) {
  return session.cart.map((item) => {
    const product = session.products.find((candidate) => candidate.id === item.productId);
    if (!product) {
      return {
        item,
        product: null,
        lineTotal: 0,
      };
    }
    return {
      item,
      product,
      lineTotal: item.quantity * product.price,
    };
  });
}

function getCartTotal(session: HostedSession) {
  return getCartRows(session).reduce((sum, row) => sum + row.lineTotal, 0);
}

function renderCart(session: HostedSession, response: ServerResponse) {
  const rows = getCartRows(session);
  const tableRows = rows.length
    ? rows
        .map((row) => `<tr>
          <td>${escapeHtml(row.product?.name ?? row.item.productId)}</td>
          <td>${row.item.quantity}</td>
          <td>${money(row.lineTotal)}</td>
        </tr>`)
        .join("")
    : `<tr><td colspan="3" class="muted">Cart is empty.</td></tr>`;

  sendHtml(
    response,
    200,
    layout({
      title: "Shopping Cart",
      session,
      body: `<section class="panel">
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p class="price">Cart total: ${money(getCartTotal(session))}</p>
        <form method="post" action="/shopping/checkout?session=${encodeURIComponent(session.token)}">
          <label>
            Shipping method
            <select name="shippingMethod">
              <option value="standard">Standard</option>
              <option value="express">Express</option>
            </select>
          </label>
          <button type="submit">Submit order</button>
        </form>
      </section>`,
    }),
  );
}

function renderOrder(session: HostedSession, order: Order, response: ServerResponse) {
  const score = evaluateSession(session);
  sendHtml(
    response,
    200,
    layout({
      title: "Order Confirmation",
      session,
      body: `<section class="panel">
        <h2>Order submitted</h2>
        <p>Order id: <strong>${escapeHtml(order.id)}</strong></p>
        <p>Total: <strong>${money(order.total)}</strong></p>
        <p>Shipping: <strong>${escapeHtml(order.shippingMethod)}</strong></p>
        <h2>Evaluator preview</h2>
        <pre class="score">${escapeHtml(JSON.stringify(score, null, 2))}</pre>
      </section>`,
    }),
  );
}

function renderWikiIndex(session: HostedSession, response: ServerResponse, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const articles = normalizedQuery
    ? session.wikiArticles.filter((article) =>
        `${article.title} ${article.summary} ${article.body}`.toLowerCase().includes(normalizedQuery),
      )
    : session.wikiArticles;

  const cards = articles
    .map(
      (article) => `<article class="card">
        <h2>${escapeHtml(article.title)}</h2>
        <p class="muted">${escapeHtml(article.summary)}</p>
        <a href="/wiki/article/${encodeURIComponent(article.slug)}?session=${encodeURIComponent(session.token)}">Open article</a>
      </article>`,
    )
    .join("");

  const submitted = session.wikiAnswerSubmissions.at(-1);
  sendHtml(
    response,
    200,
    layout({
      title: "AgentBench Wiki",
      session,
      body: `<section class="panel">
        <form method="get" action="/wiki">
          <input type="hidden" name="session" value="${escapeHtml(session.token)}" />
          <label>
            Search knowledge base
            <input name="q" value="${escapeHtml(query)}" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          </label>
          <button type="submit" style="margin-top:12px;">Search</button>
        </form>
      </section>
      <section class="grid" style="margin-top:16px;">${cards}</section>
      <section class="panel" style="margin-top:16px;">
        <h2>Submit answer</h2>
        <p>Enter the date when wiki-lite followed the hosted-web suite alpha.</p>
        <form method="post" action="/wiki/answer?session=${encodeURIComponent(session.token)}">
          <input name="answer" placeholder="June 1, 2026" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          <button type="submit" style="margin-top:12px;">Submit answer</button>
        </form>
        ${
          submitted
            ? `<p style="margin-top:12px;">Latest submission: <strong>${escapeHtml(submitted.answer)}</strong></p>`
            : ""
        }
      </section>`,
    }),
  );
}

function renderWikiArticle(session: HostedSession, article: WikiArticle, response: ServerResponse) {
  sendHtml(
    response,
    200,
    layout({
      title: article.title,
      session,
      body: `<section class="panel">
        <p class="muted">${escapeHtml(article.summary)}</p>
        <p>${escapeHtml(article.body)}</p>
      </section>
      <section class="panel" style="margin-top:16px;">
        <h2>Submit answer</h2>
        <form method="post" action="/wiki/answer?session=${encodeURIComponent(session.token)}">
          <input name="answer" placeholder="Enter the exact date" style="display:block;width:100%;min-height:40px;margin-top:8px;border:1px solid #d8d2c7;border-radius:6px;padding:8px 10px;" />
          <button type="submit" style="margin-top:12px;">Submit answer</button>
        </form>
      </section>`,
    }),
  );
}

function evaluateCheckout(session: HostedSession): HostedWebScoreResult {
  const submittedOrder = session.orders.at(-1);
  const backend = evaluateBackendState(session, submittedOrder);
  const ui = submittedOrder
    ? passedEvaluator({
        type: "ui_state",
        name: "order confirmation available",
        evidence: { orderId: submittedOrder.id, confirmationPath: `/shopping/order/${submittedOrder.id}` },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "order confirmation available",
        errorMessage: "No submitted order exists.",
      });
  const finalResponse = failedEvaluator({
    type: "final_response",
    name: "agent reports submitted order id",
    required: false,
    errorMessage: "Final agent response is not collected by hosted-sites yet.",
  });
  const evaluators = [backend, ui, finalResponse];

  return aggregateStrictScore({
    evaluators,
    passSummary: "Submitted order satisfies the constrained checkout task.",
    failSummary: "Submitted order does not satisfy all required checkout conditions.",
  });
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replaceAll(/[,\.]/g, "");
}

function evaluateWiki(session: HostedSession): HostedWebScoreResult {
  const expectedAnswer = "June 1, 2026";
  const latestAnswer = session.wikiAnswerSubmissions.at(-1);
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];
  const articleViewed =
    session.events.some(
      (event) =>
        event.type === "page.load" &&
        typeof event.url === "string" &&
        String(event.url).includes("/wiki/article/agentbench-release-history"),
    ) || viewedArticleSlugs.includes("agentbench-release-history");
  const answerMatches = latestAnswer ? normalizeAnswer(latestAnswer.answer) === normalizeAnswer(expectedAnswer) : false;

  const retrieveValue = answerMatches
    ? passedEvaluator({
        type: "retrieve_value",
        name: "retrieved hosted-web wiki follow-up date",
        evidence: { answer: latestAnswer?.answer, expectedAnswer },
      })
    : failedEvaluator({
        type: "retrieve_value",
        name: "retrieved hosted-web wiki follow-up date",
        errorMessage: "Submitted answer does not match the expected date.",
        evidence: { answer: latestAnswer?.answer ?? null, expectedAnswer },
      });
  const backendState = latestAnswer
    ? passedEvaluator({
        type: "backend_state",
        name: "answer submission persisted",
        evidence: { answer: latestAnswer.answer, submittedAt: latestAnswer.submittedAt },
      })
    : failedEvaluator({
        type: "backend_state",
        name: "answer submission persisted",
        errorMessage: "No answer was submitted.",
      });
  const uiState = articleViewed
    ? passedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        evidence: { article: "agentbench-release-history" },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        errorMessage: "The required article was not opened.",
      });

  return aggregateStrictScore({
    evaluators: [retrieveValue, backendState, uiState],
    passSummary: "Submitted answer matches the hosted wiki release-history task.",
    failSummary: "Wiki task requires opening the release-history article and submitting the exact date.",
  });
}

function evaluateSession(session: HostedSession): HostedWebScoreResult {
  return session.app === "wiki-lite" ? evaluateWiki(session) : evaluateCheckout(session);
}

function evaluateBackendState(session: HostedSession, order: Order | undefined): HostedWebEvaluatorResult {
  if (!order) {
    return failedEvaluator({
      type: "backend_state",
      name: "submitted constrained charger order",
      errorMessage: "No submitted order exists.",
    });
  }

  const rows = order.items.map((item) => {
    const product = session.products.find((candidate) => candidate.id === item.productId);
    return { item, product };
  });
  const chargerItems = rows.filter((row) => row.product?.category === "charger");
  const restrictedItems = rows.filter((row) => row.product?.restricted);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const evidence = {
    orderId: order.id,
    itemCount,
    chargerItems: chargerItems.map((row) => row.product?.name),
    restrictedItems: restrictedItems.map((row) => row.product?.name),
    total: order.total,
    shippingMethod: order.shippingMethod,
  };
  const pass =
    itemCount === 1 &&
    chargerItems.length === 1 &&
    restrictedItems.length === 0 &&
    order.total <= 30 &&
    order.shippingMethod === "standard";

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "submitted constrained charger order",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "submitted constrained charger order",
        evidence,
        errorMessage: "Order must contain exactly one unrestricted charger, cost at most $30, and use standard shipping.",
      });
}

async function forwardRunEvent(session: HostedSession, type: string, payload: Record<string, unknown>) {
  if (!agentbenchWebUrl || !session.runId) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.callbackSecret || runnerSharedSecret
        ? { "x-runner-secret": session.callbackSecret ?? runnerSharedSecret ?? "" }
        : {}),
    },
    body: JSON.stringify({
      type,
      payload,
    }),
  }).catch(() => undefined);
}

function telemetryRunEventType(type: string) {
  if (type === "page.load") {
    return "hosted.page.load";
  }

  if (type === "click" || type === "input" || type === "submit" || type === "navigation") {
    return "hosted.action";
  }

  if (type === "task.signal") {
    return "hosted.task_signal";
  }

  return "hosted.action";
}

async function forwardCompletion(
  session: HostedSession,
  result: Pick<HostedWebScoreResult, "status" | "score" | "summary">,
) {
  if (!agentbenchWebUrl || !session.runId) {
    return;
  }

  await fetch(`${agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.callbackSecret || runnerSharedSecret
        ? { "x-runner-secret": session.callbackSecret ?? runnerSharedSecret ?? "" }
        : {}),
    },
    body: JSON.stringify({
      status: result.status === "passed" ? "completed" : "failed",
      score: result.score,
      errorMessage: result.status === "passed" ? null : result.summary,
      artifacts: [],
    }),
  }).catch(() => undefined);
}

function getAttemptSessions(attemptId: string) {
  return [...sessions.values()]
    .filter((session) => session.attemptId === attemptId)
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}

async function loadAttemptSessions(attemptId: string) {
  const inMemory = getAttemptSessions(attemptId);
  if (inMemory.length > 1) {
    return inMemory;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("hosted_web_sessions")
    .select(
      "id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, created_at, start_url, expires_at, access_count, last_accessed_at, first_seen_ip, last_seen_ip, first_seen_user_agent, last_seen_user_agent",
    )
    .eq("attempt_id", attemptId)
    .order("sequence_index", { ascending: true });

  if (error || !data) {
    return [];
  }

  const hydrated = data.map((row) => {
    const token = (() => {
      try {
        return new URL(row.start_url).searchParams.get("session") ?? makeId("missing");
      } catch {
        return makeId("missing");
      }
    })();
    const session = hydrateSessionFromMetadata({
      token,
      row: {
        id: row.id,
        run_id: row.run_id,
        case_id: row.case_id,
        attempt_id: row.attempt_id,
        app: row.app,
        task_slug: row.task_slug,
        task_version: row.task_version,
        sequence_index: row.sequence_index,
        weight: row.weight,
        required: row.required,
        seed_version: row.seed_version,
        status: row.status,
        expires_at: row.expires_at,
        access_count: row.access_count,
        last_accessed_at: row.last_accessed_at,
        first_seen_ip: row.first_seen_ip,
        last_seen_ip: row.last_seen_ip,
        first_seen_user_agent: row.first_seen_user_agent,
        last_seen_user_agent: row.last_seen_user_agent,
        metadata:
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : null,
        created_at: row.created_at,
      },
    });
    const existing = sessions.get(token);
    if (!existing) {
      sessions.set(token, session);
      return session;
    }
    return existing;
  });

  return hydrated.sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}

type HostedAttemptOverviewSession = HostedAttemptReadModel["sessions"][number] & {
  token: string;
  app: string;
  taskSlug: string;
  title: string | null;
  goal: string;
  startPath: string | null;
};

async function loadAttemptReadModel(attemptId: string): Promise<HostedAttemptReadModel<HostedAttemptOverviewSession>> {
  const [metadata, attemptSessions] = await Promise.all([
    loadAttemptMetadata(attemptId),
    loadAttemptSessions(attemptId),
  ]);

  return buildHostedAttemptReadModel({
    attemptId,
    metadata,
    sessions: attemptSessions.map((session) => ({
      id: session.id,
      token: session.token,
      app: session.app,
      taskSlug: session.taskSlug,
      title: session.title,
      goal: session.goal,
      sequenceIndex: session.sequenceIndex,
      status: session.status,
      startPath: session.startPath,
    })),
  });
}

const attemptLifecycle = createAttemptLifecycle({
  now,
  getSupabaseAdmin,
  loadAttemptMetadata,
  loadAttemptSessions,
  loadAttemptReadModel,
  loadLatestSessionResult,
  persistScoreResult: async (session, result) => persistScoreResult(session as HostedSession, result),
  forwardTimeoutCompletion,
  evictInMemorySessions,
});

function renderAttemptOverview(
  readModel: HostedAttemptReadModel<HostedAttemptOverviewSession>,
  currentSession: HostedSession,
  response: ServerResponse,
) {
  const cards = readModel.sessions
    .map((session, index) => {
      const state = session.id === readModel.activeSessionId ? "active" : session.status;
      return `<article class="card">
        <div class="muted">Session ${index + 1}</div>
        <h2>${escapeHtml(session.title ?? session.taskSlug)}</h2>
        <p>${escapeHtml(session.goal)}</p>
        <p class="muted">App: ${escapeHtml(session.app)} · State: ${escapeHtml(state)}</p>
        <a href="${escapeHtml(`${publicBaseUrl}${session.startPath ?? defaultStartPathForApp(session.app)}?session=${encodeURIComponent(session.token)}`)}">Open session</a>
      </article>`;
    })
    .join("");

  sendHtml(
    response,
    200,
    layout({
      title: "Hosted Suite Overview",
      session: currentSession,
      body: `<section class="panel">
        <h2>Attempt ${escapeHtml(readModel.attemptId)}</h2>
        <p>${readModel.progress.completed} of ${readModel.progress.total} sessions have submitted results.</p>
      </section>
      <section class="grid" style="margin-top:16px;">${cards}</section>`,
    }),
  );
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      const session = await createHostedSession({});
      redirect(response, `/shopping?session=${encodeURIComponent(session.token)}`);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      const input = await readJson(request);
      const runId = typeof input.runId === "string" ? input.runId : null;
      const caseId = typeof input.caseId === "string" ? input.caseId : null;
      const attemptId = typeof input.attemptId === "string" ? input.attemptId : null;
      const callbackSecret = typeof input.callbackSecret === "string" ? input.callbackSecret : null;
      const suiteSlug = typeof input.suiteSlug === "string" ? input.suiteSlug : undefined;
      const suiteVersion = typeof input.suiteVersion === "string" ? input.suiteVersion : undefined;
      const app = typeof input.app === "string" ? input.app : undefined;
      const taskSlug = typeof input.taskSlug === "string" ? input.taskSlug : undefined;
      const taskVersion = typeof input.taskVersion === "string" ? input.taskVersion : "v1";
      const sequenceIndex = typeof input.sequenceIndex === "number" ? input.sequenceIndex : 0;
      const weight = typeof input.weight === "number" ? input.weight : 1;
      const required = typeof input.required === "boolean" ? input.required : true;
      const title = typeof input.title === "string" ? input.title : null;
      const goal = typeof input.goal === "string" ? input.goal : null;
      const startPath = typeof input.startPath === "string" ? input.startPath : null;
      const seedVersion = typeof input.seedVersion === "string" ? input.seedVersion : null;
      const metadata =
        input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? (input.metadata as Record<string, unknown>)
          : {};
      const session = await createHostedSession({
        runId,
        caseId,
        attemptId,
        callbackSecret,
        suiteSlug,
        suiteVersion,
        app,
        taskSlug,
        taskVersion,
        sequenceIndex,
        weight,
        required,
        title,
        goal,
        startPath,
        seedVersion,
        metadata,
      });
      const startUrl = `${publicBaseUrl}${session.startPath ?? "/shopping"}?session=${encodeURIComponent(session.token)}`;
      await forwardRunEvent(session, "hosted.session.created", {
        source: "hosted-sites",
        sessionId: session.id,
        attemptId: session.attemptId,
        app: session.app,
        taskSlug: session.taskSlug,
        sequenceIndex: session.sequenceIndex,
        startUrl,
      });
      sendJson(response, 201, {
        sessionId: session.id,
        attemptId: session.attemptId,
        token: session.token,
        app: session.app,
        taskSlug: session.taskSlug,
        taskVersion: session.taskVersion,
        sequenceIndex: session.sequenceIndex,
        weight: session.weight,
        required: session.required,
        startUrl,
        goal: session.goal,
        title: session.title,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/telemetry") {
      const input = await readJson(request);
      const telemetryUrl = new URL(url);
      if (typeof input.session === "string") {
        telemetryUrl.searchParams.set("session", input.session);
      }
      const session = await getSession(telemetryUrl, request);
      if (!session) {
        badRequest(response, "Unknown session");
        return;
      }
      const telemetryType = typeof input.type === "string" ? input.type : "hosted.event";
      const payload = {
        type: telemetryType,
        payload: input.payload,
        url: input.url,
        title: input.title,
      };
      await recordEvent(session, payload);
      await forwardRunEvent(session, telemetryRunEventType(telemetryType), {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        ...payload,
      });
      sendJson(response, 201, { ok: true });
      return;
    }

    const scoreMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/score$/);
    if (request.method === "GET" && scoreMatch) {
      const token = decodeURIComponent(scoreMatch[1]);
      const session = sessions.get(token);
      if (!session) {
        notFound(response);
        return;
      }
      sendJson(response, 200, evaluateSession(session));
      return;
    }

    const completeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/complete$/);
    if (request.method === "POST" && completeMatch) {
      const token = decodeURIComponent(completeMatch[1]);
      const session = sessions.get(token);
      if (!session) {
        notFound(response);
        return;
      }
      const result = evaluateSession(session);
      const finalization = await attemptLifecycle.executeCompleteSessionCommand({
        type: "complete-session",
        session,
        result,
      });
      await forwardRunEvent(session, "hosted.score", finalization.result);
      if (finalization.attemptResult.complete && finalization.attemptResult.aggregate) {
        await forwardCompletion(session, finalization.attemptResult.aggregate);
      }
      sendJson(response, 200, finalization.result);
      return;
    }

    const attemptMatch = url.pathname.match(/^\/attempts\/([^/]+)$/);
    if (request.method === "GET" && attemptMatch) {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const attemptId = decodeURIComponent(attemptMatch[1]);
      if (session.attemptId !== attemptId) {
        badRequest(response, "Session does not belong to this attempt");
        return;
      }
      renderAttemptOverview(await loadAttemptReadModel(attemptId), session, response);
      return;
    }

    const advanceMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/advance$/);
    if (request.method === "GET" && advanceMatch) {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const attemptId = decodeURIComponent(advanceMatch[1]);
      const advance = await attemptLifecycle.executeResolveAdvanceCommand({
        type: "resolve-advance",
        attemptId,
        currentSessionId: session.id,
      });
      if (!advance.ok) {
        badRequest(response, "Session does not belong to this attempt");
        return;
      }
      sendJson(response, 200, {
        attemptId,
        currentSessionId: session.id,
        complete: advance.complete,
        nextSessionId: advance.nextSession?.id ?? null,
        nextStartUrl:
          advance.nextSession
            ? `${publicBaseUrl}${advance.nextSession.startPath ?? defaultStartPathForApp(advance.nextSession.app)}?session=${encodeURIComponent(advance.nextSession.token)}`
            : null,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/shopping") {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      renderProducts(session, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/shopping/cart") {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const form = await readForm(request);
      const productId = form.get("productId");
      if (typeof productId !== "string" || !session.products.some((product) => product.id === productId)) {
        badRequest(response, "Invalid product");
        return;
      }
      const existing = session.cart.find((item) => item.productId === productId);
      if (existing) {
        existing.quantity += 1;
      } else {
        session.cart.push({ productId, quantity: 1 });
      }
      await persistSessionSnapshot(session);
      await recordEvent(session, { type: "task.signal", name: "cart.item_added", productId });
      await forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "cart.item_added",
        productId,
      });
      redirect(response, `/shopping/cart?session=${encodeURIComponent(session.token)}`);
      return;
    }

    if (request.method === "GET" && url.pathname === "/shopping/cart") {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      renderCart(session, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/shopping/checkout") {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      if (session.cart.length === 0) {
        badRequest(response, "Cart is empty");
        return;
      }
      const form = await readForm(request);
      const shippingMethod = form.get("shippingMethod") === "express" ? "express" : "standard";
      const order: Order = {
        id: makeId("ord"),
        items: session.cart.map((item) => ({ ...item })),
        total: getCartTotal(session),
        shippingMethod,
        submittedAt: now(),
      };
      session.orders.push(order);
      session.cart = [];
      await persistSessionSnapshot(session);
      await recordEvent(session, { type: "task.signal", name: "order.submitted", orderId: order.id });
      await forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "order.submitted",
        orderId: order.id,
      });
      const result = evaluateSession(session);
      const finalization = await attemptLifecycle.executeCompleteSessionCommand({
        type: "complete-session",
        session,
        result,
      });
      await forwardRunEvent(session, "hosted.score", finalization.result);
      if (finalization.attemptResult.complete && finalization.attemptResult.aggregate) {
        await forwardCompletion(session, finalization.attemptResult.aggregate);
      }
      redirect(response, `/shopping/order/${encodeURIComponent(order.id)}?session=${encodeURIComponent(session.token)}`);
      return;
    }

    const orderMatch = url.pathname.match(/^\/shopping\/order\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const order = session.orders.find((candidate) => candidate.id === decodeURIComponent(orderMatch[1]));
      if (!order) {
        notFound(response);
        return;
      }
      renderOrder(session, order, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/wiki") {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      renderWikiIndex(session, response, url.searchParams.get("q") ?? "");
      return;
    }

    const wikiArticleMatch = url.pathname.match(/^\/wiki\/article\/([^/]+)$/);
    if (request.method === "GET" && wikiArticleMatch) {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const articleSlug = decodeURIComponent(wikiArticleMatch[1]);
      const article = session.wikiArticles.find((candidate) => candidate.slug === articleSlug);
      if (!article) {
        notFound(response);
        return;
      }
      const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
        ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
        : [];
      if (!viewedArticleSlugs.includes(articleSlug)) {
        session.metadata = {
          ...session.metadata,
          viewedArticleSlugs: [...viewedArticleSlugs, articleSlug],
        };
        await persistSessionSnapshot(session);
      }
      renderWikiArticle(session, article, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/wiki/answer") {
      const session = await getSession(url, request);
      if (!session) {
        badRequest(response, "Missing or invalid session");
        return;
      }
      const form = await readForm(request);
      const answer = form.get("answer");
      if (typeof answer !== "string" || answer.trim().length === 0) {
        badRequest(response, "Answer is required");
        return;
      }
      session.wikiAnswerSubmissions.push({
        answer: answer.trim(),
        submittedAt: now(),
      });
      await persistSessionSnapshot(session);
      await recordEvent(session, { type: "task.signal", name: "wiki.answer_submitted", answer: answer.trim() });
      await forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "wiki.answer_submitted",
        answer: answer.trim(),
      });
      const result = evaluateSession(session);
      const finalization = await attemptLifecycle.executeCompleteSessionCommand({
        type: "complete-session",
        session,
        result,
      });
      await forwardRunEvent(session, "hosted.score", finalization.result);
      if (finalization.attemptResult.complete && finalization.attemptResult.aggregate) {
        await forwardCompletion(session, finalization.attemptResult.aggregate);
      }
      redirect(response, `/wiki?session=${encodeURIComponent(session.token)}`);
      return;
    }

    notFound(response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

server.listen(port, () => {
  console.log(`[hosted-sites] listening on ${publicBaseUrl}`);
});

void runCleanupSweep("startup");
const cleanupTimer = setInterval(() => {
  void runCleanupSweep("interval");
}, cleanupSweepIntervalMs);
cleanupTimer.unref();
