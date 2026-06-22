import type { IncomingMessage } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyHostedViewerToken, type Database, type HostedWebSessionMetadata } from "@agentbench/shared";
import type { SessionCache } from "./session-cache.js";
import type { HostedAppPersistenceState, HostedAppSessionState, HostedSession } from "./types.js";

type PersistedSessionMetadata = HostedWebSessionMetadata<HostedAppPersistenceState>;
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
  | "created_at"
  | "expires_at"
  | "access_count"
  | "last_accessed_at"
  | "first_seen_ip"
  | "last_seen_ip"
  | "first_seen_user_agent"
  | "last_seen_user_agent"
> & {
  metadata: PersistedSessionMetadata | null;
};
type RawPersistedSessionRow = Omit<PersistedSessionRow, "metadata"> & {
  metadata: Database["public"]["Tables"]["hosted_web_sessions"]["Row"]["metadata"];
};

type SessionStoreDeps = {
  sessions: Map<string, HostedSession>;
  sessionCache?: SessionCache | null;
  publicBaseUrl: string;
  now: () => string;
  makeId: (prefix: string) => string;
  hashToken: (token: string) => string;
  viewerTokenSecret?: string;
  getSupabaseAdmin: () => SupabaseClient<Database> | null | undefined;
  persistSessionSnapshotDurably?: (
    session: HostedSession,
    metadata: Record<string, unknown>,
  ) => Promise<unknown>;
  persistSessionAccess?: (params: {
    session: HostedSession;
    request: IncomingMessage;
    event: string;
  }) => Promise<unknown>;
  defaultStartPathForApp: (app: string) => string;
  defaultGoalForSession: (app: string, taskSlug: string) => string;
  resolveHostedAppId: (app: string) => HostedSession["app"];
  buildInitialSessionState: (app: string) => HostedAppSessionState;
  extractHostedAppState: (session: HostedSession) => HostedAppPersistenceState;
  hydrateHostedAppState: (app: string, value: unknown) => HostedAppSessionState;
  clientIp: (request: IncomingMessage) => string | null;
  clientUserAgent: (request: IncomingMessage) => string | null;
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
      schemaVersion: 1,
      suiteSlug: session.suiteSlug,
      suiteVersion: session.suiteVersion,
      title: session.title,
      goal: session.goal,
      startPath: session.startPath,
      appState: deps.extractHostedAppState(session),
    } satisfies PersistedSessionMetadata;
  }

  async function cacheSession(session: HostedSession) {
    deps.sessions.set(session.token, session);
    if (!deps.sessionCache) {
      return;
    }

    try {
      await deps.sessionCache.set(session);
    } catch (error) {
      console.error("[hosted-sites] failed to cache session", error);
    }
  }

  async function deleteCachedSession(token: string) {
    deps.sessions.delete(token);
    if (!deps.sessionCache) {
      return;
    }

    try {
      await deps.sessionCache.delete(token);
    } catch (error) {
      console.error("[hosted-sites] failed to delete cached session", error);
    }
  }

  function hydrateSessionFromMetadata(params: {
    token: string;
    row: PersistedSessionRow;
    accessMode?: "write" | "viewer";
  }) {
    const metadata =
      params.row.metadata && typeof params.row.metadata === "object" && !Array.isArray(params.row.metadata)
        ? params.row.metadata
        : {};
    const app = deps.resolveHostedAppId(params.row.app);
    const appState = deps.hydrateHostedAppState(app, metadata.appState);

    return {
      id: params.row.id,
      token: params.token,
      accessMode: params.accessMode ?? "write",
      runId: params.row.run_id,
      caseId: params.row.case_id,
      attemptId: params.row.attempt_id,
      callbackSecret: null,
      app,
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
      state: appState,
      persisted: params.row.status !== "expired",
    } as HostedSession;
  }

  function asPersistedSessionRow(row: RawPersistedSessionRow): PersistedSessionRow {
    return {
      ...row,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as PersistedSessionMetadata)
          : null,
    };
  }

  async function persistSessionSnapshot(session: HostedSession) {
    if (session.accessMode === "viewer") {
      return;
    }

    await cacheSession(session);

    if (!session.persisted) {
      return;
    }

    await deps.persistSessionSnapshotDurably?.(session, buildSessionMetadata(session));
  }

  async function markSessionTerminal(session: HostedSession, result: { status: string }) {
    session.status = result.status === "passed" ? "completed" : "failed";
    await cacheSession(session);
  }

  async function markSessionExpired(session: HostedSession, request: IncomingMessage) {
    session.status = "expired";
    await deleteCachedSession(session.token);

    await deps.persistSessionAccess?.({
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

    await cacheSession(session);

    await deps.persistSessionAccess?.({
      session,
      request,
      event,
    });
  }

  async function refreshPersistedSessionControlState(session: HostedSession) {
    if (deps.sessionCache) {
      return session;
    }

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

    if (
      data.status === "created" ||
      data.status === "active" ||
      data.status === "completed" ||
      data.status === "failed" ||
      data.status === "expired"
    ) {
      session.status = data.status;
    }
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
    const app = deps.resolveHostedAppId(params.app ?? "shopping-lite");
    const taskSlug = params.taskSlug ?? "shopping-constrained-checkout";
    const startPath = params.startPath ?? deps.defaultStartPathForApp(app);
    const initialState = deps.buildInitialSessionState(app);
    const baseSession = {
      id: deps.makeId("hws"),
      token,
      accessMode: "write",
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
      state: initialState,
      persisted: false,
    } as HostedSession;

    await cacheSession(baseSession);
    return baseSession;
  }

  async function getSession(url: URL, request: IncomingMessage) {
    const token = url.searchParams.get("session");
    if (!token) {
      return null;
    }

    const viewerClaims = verifyHostedViewerToken(token, deps.viewerTokenSecret);
    if (viewerClaims) {
      const supabase = deps.getSupabaseAdmin();
      if (!supabase) {
        return null;
      }

      const { data, error } = await supabase
        .from("hosted_web_sessions")
        .select("id, run_id, case_id, attempt_id, app, task_slug, task_version, sequence_index, weight, required, seed_version, status, metadata, created_at, expires_at, access_count, last_accessed_at, first_seen_ip, last_seen_ip, first_seen_user_agent, last_seen_user_agent")
        .eq("id", viewerClaims.sessionId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const viewerSession = hydrateSessionFromMetadata({
        token,
        row: asPersistedSessionRow(data),
        accessMode: "viewer",
      });
      return isExpired(viewerSession) || viewerSession.status === "expired" ? null : viewerSession;
    }

    if (deps.sessionCache) {
      try {
        const cached = await deps.sessionCache.get(token);
        if (cached) {
          deps.sessions.set(token, cached);
          if (isExpired(cached) || cached.status === "expired") {
            await markSessionExpired(cached, request);
            return null;
          }
          await recordSessionAccess(cached, request, "session.access");
          return cached;
        }
      } catch (error) {
        console.error("[hosted-sites] failed to read cached session", error);
      }
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

    const hydrated = hydrateSessionFromMetadata({ token, row: asPersistedSessionRow(data) });
    if (isExpired(hydrated) || hydrated.status === "expired") {
      await markSessionExpired(hydrated, request);
      return null;
    }
    await cacheSession(hydrated);
    await recordSessionAccess(hydrated, request, "session.access");
    return hydrated;
  }

  async function getSessionByToken(token: string, request: IncomingMessage) {
    const sessionUrl = new URL("/", deps.publicBaseUrl);
    sessionUrl.searchParams.set("session", token);
    return getSession(sessionUrl, request);
  }

  return {
    createHostedSession,
    getSession,
    getSessionByToken,
    persistSessionSnapshot,
    markSessionTerminal,
  };
}
