import type { IncomingMessage } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem, Order } from "../apps/shopping-lite/types.js";
import type { WikiAnswerSubmission } from "../apps/wiki-lite/types.js";
import type { HostedSession } from "./types.js";

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

type SessionStoreDeps = {
  sessions: Map<string, HostedSession>;
  publicBaseUrl: string;
  now: () => string;
  makeId: (prefix: string) => string;
  hashToken: (token: string) => string;
  getSupabaseAdmin: () => SupabaseClient | null | undefined;
  defaultStartPathForApp: (app: string) => string;
  defaultGoalForSession: (app: string, taskSlug: string) => string;
  buildInitialSessionState: (app: string) => Pick<
    HostedSession,
    "products" | "cart" | "orders" | "wikiArticles" | "wikiAnswerSubmissions" | "threads" | "moderationActions"
  >;
  clientIp: (request: IncomingMessage) => string | null;
  clientUserAgent: (request: IncomingMessage) => string | null;
  clientReferer: (request: IncomingMessage) => string | null;
  onSessionExpired: (params: {
    attemptId: string;
    runId: string | null;
    expiredSessionId: string;
    expiredTaskSlug: string;
  }) => Promise<unknown>;
};

export function createSessionStore(deps: SessionStoreDeps) {
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
    row: PersistedSessionRow;
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
    const initialState = deps.buildInitialSessionState(params.row.app);

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
          : deps.defaultGoalForSession(params.row.app, params.row.task_slug),
      startPath:
        typeof metadata.startPath === "string"
          ? metadata.startPath
          : deps.defaultStartPathForApp(params.row.app),
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
      products: initialState.products,
      cart,
      orders,
      wikiArticles: initialState.wikiArticles,
      wikiAnswerSubmissions,
      threads: initialState.threads,
      moderationActions: initialState.moderationActions,
      persisted: params.row.status !== "expired",
    } satisfies HostedSession;
  }

  async function persistSessionSnapshot(session: HostedSession) {
    if (!session.persisted) {
      return;
    }

    const supabase = deps.getSupabaseAdmin();
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

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("hosted_web_access_logs").insert({
      session_id: params.session.id,
      attempt_id: params.session.attemptId,
      run_id: params.session.runId,
      event: params.event,
      ip: deps.clientIp(params.request),
      user_agent: deps.clientUserAgent(params.request),
      referer: deps.clientReferer(params.request),
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
    deps.sessions.delete(session.token);

    if (session.persisted) {
      const supabase = deps.getSupabaseAdmin();
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

    if (session.attemptId) {
      await deps.onSessionExpired({
        attemptId: session.attemptId,
        runId: session.runId,
        expiredSessionId: session.id,
        expiredTaskSlug: session.taskSlug,
      });
    }
  }

  async function recordSessionAccess(session: HostedSession, request: IncomingMessage, event: string) {
    const accessedAt = deps.now();
    const ip = deps.clientIp(request);
    const agent = deps.clientUserAgent(request);

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
      const supabase = deps.getSupabaseAdmin();
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

  async function persistNewSession(session: HostedSession, startUrl: string): Promise<HostedSession> {
    const supabase = deps.getSupabaseAdmin();
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
        session_token_hash: deps.hashToken(session.token),
        status: session.status,
        metadata: buildSessionMetadata(session),
        activated_at: deps.now(),
        expires_at: expiresAt,
      })
      .select("id, created_at")
      .single();

    if (sessionError || !sessionRow) {
      console.error("[hosted-sites] failed to persist hosted session", sessionError);
      return session;
    }

    return {
      ...session,
      id: sessionRow.id,
      expiresAt,
      createdAt: sessionRow.created_at,
      persisted: true,
    };
  }

  async function refreshPersistedSessionControlState(session: HostedSession) {
    if (!session.persisted) {
      return session;
    }

    const supabase = deps.getSupabaseAdmin();
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
    const token = deps.makeId("tok");
    const app = params.app ?? "shopping-lite";
    const taskSlug = params.taskSlug ?? "shopping-constrained-checkout";
    const startPath = params.startPath ?? deps.defaultStartPathForApp(app);
    const startUrl = `${deps.publicBaseUrl}${startPath}?session=${encodeURIComponent(token)}`;
    const initialState = deps.buildInitialSessionState(app);
    const baseSession: HostedSession = {
      id: deps.makeId("hws"),
      token,
      runId: params.runId ?? null,
      caseId: params.caseId ?? null,
      attemptId: params.attemptId ?? null,
      callbackSecret: params.callbackSecret ?? null,
      app,
      suiteSlug: params.suiteSlug ?? taskSlug,
      suiteVersion: params.suiteVersion ?? "v1",
      taskSlug,
      taskVersion: params.taskVersion ?? "v1",
      sequenceIndex:
        typeof params.sequenceIndex === "number" && Number.isFinite(params.sequenceIndex)
          ? Math.max(Math.trunc(params.sequenceIndex), 0)
          : 0,
      weight: typeof params.weight === "number" && Number.isFinite(params.weight) ? Math.max(params.weight, 0) : 1,
      required: params.required ?? true,
      title: params.title ?? null,
      goal: params.goal ?? deps.defaultGoalForSession(app, taskSlug),
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
      createdAt: deps.now(),
      events: [],
      products: initialState.products,
      cart: initialState.cart,
      orders: initialState.orders,
      wikiArticles: initialState.wikiArticles,
      wikiAnswerSubmissions: initialState.wikiAnswerSubmissions,
      threads: initialState.threads,
      moderationActions: initialState.moderationActions,
      persisted: false,
    };

    const session = await persistNewSession(baseSession, startUrl);
    deps.sessions.set(session.token, session);
    return session;
  }

  async function getSession(url: URL, request: IncomingMessage) {
    const token = url.searchParams.get("session");
    if (!token) {
      return null;
    }

    const existing = deps.sessions.get(token);
    if (existing) {
      await refreshPersistedSessionControlState(existing);
      if (isExpired(existing) || existing.status === "expired") {
        await markSessionExpired(existing, request);
        return null;
      }
      await recordSessionAccess(existing, request, "session.access");
      return existing;
    }

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from("hosted_web_sessions")
      .select("id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, created_at, expires_at, access_count, last_accessed_at, first_seen_ip, last_seen_ip, first_seen_user_agent, last_seen_user_agent")
      .eq("session_token_hash", deps.hashToken(token))
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const hydrated = hydrateSessionFromMetadata({ token, row: data });
    if (isExpired(hydrated) || hydrated.status === "expired") {
      await markSessionExpired(hydrated, request);
      return null;
    }
    deps.sessions.set(token, hydrated);
    await recordSessionAccess(hydrated, request, "session.access");
    return hydrated;
  }

  return {
    createHostedSession,
    getSession,
    persistSessionSnapshot,
  };
}
