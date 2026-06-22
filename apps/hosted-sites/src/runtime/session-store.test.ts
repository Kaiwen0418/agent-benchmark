import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import {
  buildInitialSessionState,
  defaultGoalForSession,
  defaultStartPathForApp,
  extractHostedAppState,
  hydrateHostedAppState,
  resolveHostedAppId,
} from "./app-registry.js";
import { createSessionStore } from "./session-store.js";
import type { SessionCache } from "./session-cache.js";
import type { HostedSession } from "./types.js";

function createMemorySessionCache(): SessionCache {
  const sessions = new Map<string, string>();
  return {
    async get(token) {
      const value = sessions.get(token);
      return value ? (JSON.parse(value) as HostedSession) : null;
    },
    async set(session) {
      sessions.set(session.token, JSON.stringify(session));
    },
    async delete(token) {
      sessions.delete(token);
    },
  };
}

function createStore(params: {
  sessions: Map<string, HostedSession>;
  sessionCache: SessionCache;
  recoverSession?: Parameters<typeof createSessionStore>[0]["recoverSession"];
}) {
  return createSessionStore({
    sessions: params.sessions,
    sessionCache: params.sessionCache,
    publicBaseUrl: "http://localhost:3003",
    now: () => "2026-06-01T00:00:00.000Z",
    makeId: (prefix) => `${prefix}_1`,
    recoverSession: params.recoverSession ?? (async () => null),
    persistSessionSnapshotDurably: async () => undefined,
    persistSessionAccess: async () => undefined,
    defaultStartPathForApp,
    defaultGoalForSession,
    resolveHostedAppId,
    buildInitialSessionState,
    extractHostedAppState,
    hydrateHostedAppState,
    clientIp: () => null,
    clientUserAgent: () => null,
    onSessionExpired: async () => undefined,
  });
}

test("session store reads sessions from shared cache without Supabase", async () => {
  const sessionCache = createMemorySessionCache();
  const firstInstanceSessions = new Map<string, HostedSession>();
  const firstStore = createStore({ sessions: firstInstanceSessions, sessionCache });

  const created = await firstStore.createHostedSession({
    app: "shopping-lite",
    taskSlug: "shopping-constrained-checkout",
  });

  firstInstanceSessions.clear();

  const secondStore = createStore({
    sessions: new Map<string, HostedSession>(),
    sessionCache,
  });
  const loaded = await secondStore.getSessionByToken(created.token, {} as IncomingMessage);

  assert.ok(loaded);
  assert.equal(loaded.id, created.id);
  assert.equal(loaded.token, created.token);
  assert.equal(loaded.accessCount, 1);
});

test("session store recovers a cache miss through the orchestrator contract", async () => {
  const recovered = await createStore({
    sessions: new Map(),
    sessionCache: createMemorySessionCache(),
    recoverSession: async ({ token }) => token === "durable-token" ? {
      id: "session-1",
      run_id: "run-1",
      case_id: "case-1",
      attempt_id: "attempt-1",
      app: "shopping-lite",
      task_slug: "shopping-constrained-checkout",
      task_version: "v1",
      sequence_index: 0,
      weight: 1,
      required: true,
      seed_version: "shopping-lite-v1",
      status: "active",
      metadata: null,
      created_at: "2026-06-01T00:00:00.000Z",
      expires_at: null,
      access_count: 0,
      last_accessed_at: null,
      first_seen_ip: null,
      last_seen_ip: null,
      first_seen_user_agent: null,
      last_seen_user_agent: null,
    } : null,
  }).getSessionByToken("durable-token", {} as IncomingMessage);

  assert.equal(recovered?.id, "session-1");
  assert.equal(recovered?.persisted, true);
});

test("session snapshots update the shared cache", async () => {
  const sessionCache = createMemorySessionCache();
  const sessions = new Map<string, HostedSession>();
  const store = createStore({ sessions, sessionCache });
  const session = await store.createHostedSession({ app: "shopping-lite" });
  if (session.app !== "shopping-lite") {
    throw new Error("Expected shopping session");
  }

  session.state.cart.push({ productId: "prod-charger-30w", quantity: 1 });
  await store.persistSessionSnapshot(session);
  sessions.clear();

  const loaded = await store.getSessionByToken(session.token, {} as IncomingMessage);
  if (loaded?.app !== "shopping-lite") {
    throw new Error("Expected cached shopping session");
  }

  assert.deepEqual(loaded.state.cart, [{ productId: "prod-charger-30w", quantity: 1 }]);
});

test("shared cache stays authoritative over stale local sessions", async () => {
  const sessionCache = createMemorySessionCache();
  const firstInstanceSessions = new Map<string, HostedSession>();
  const secondInstanceSessions = new Map<string, HostedSession>();
  const firstStore = createStore({ sessions: firstInstanceSessions, sessionCache });
  const secondStore = createStore({ sessions: secondInstanceSessions, sessionCache });
  const session = await firstStore.createHostedSession({ app: "shopping-lite" });
  if (session.app !== "shopping-lite") {
    throw new Error("Expected shopping session");
  }

  const stale = structuredClone(session);
  secondInstanceSessions.set(session.token, stale);

  session.state.cart.push({ productId: "prod-charger-30w", quantity: 1 });
  await firstStore.persistSessionSnapshot(session);

  const loaded = await secondStore.getSessionByToken(session.token, {} as IncomingMessage);
  if (loaded?.app !== "shopping-lite") {
    throw new Error("Expected cached shopping session");
  }

  assert.deepEqual(loaded.state.cart, [{ productId: "prod-charger-30w", quantity: 1 }]);
});

test("terminal status propagates through the shared cache", async () => {
  const sessionCache = createMemorySessionCache();
  const firstStore = createStore({ sessions: new Map<string, HostedSession>(), sessionCache });
  const secondStore = createStore({ sessions: new Map<string, HostedSession>(), sessionCache });
  const session = await firstStore.createHostedSession({ app: "wiki-lite" });

  await firstStore.markSessionTerminal(session, { status: "failed" });
  const loaded = await secondStore.getSessionByToken(session.token, {} as IncomingMessage);

  assert.equal(loaded?.status, "failed");
});
