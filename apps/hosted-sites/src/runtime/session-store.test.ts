import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { buildInitialSessionState, defaultGoalForSession, defaultStartPathForApp } from "./app-registry.js";
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
}) {
  return createSessionStore({
    sessions: params.sessions,
    sessionCache: params.sessionCache,
    publicBaseUrl: "http://localhost:3003",
    now: () => "2026-06-01T00:00:00.000Z",
    makeId: (prefix) => `${prefix}_1`,
    hashToken: (token) => `hashed:${token}`,
    getSupabaseAdmin: () => null,
    defaultStartPathForApp,
    defaultGoalForSession,
    buildInitialSessionState,
    clientIp: () => null,
    clientUserAgent: () => null,
    clientReferer: () => null,
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

test("session snapshots update the shared cache", async () => {
  const sessionCache = createMemorySessionCache();
  const sessions = new Map<string, HostedSession>();
  const store = createStore({ sessions, sessionCache });
  const session = await store.createHostedSession({ app: "shopping-lite" });

  session.cart.push({ productId: "prod-charger-30w", quantity: 1 });
  await store.persistSessionSnapshot(session);
  sessions.clear();

  const loaded = await store.getSessionByToken(session.token, {} as IncomingMessage);

  assert.deepEqual(loaded?.cart, [{ productId: "prod-charger-30w", quantity: 1 }]);
});

test("shared cache stays authoritative over stale local sessions", async () => {
  const sessionCache = createMemorySessionCache();
  const firstInstanceSessions = new Map<string, HostedSession>();
  const secondInstanceSessions = new Map<string, HostedSession>();
  const firstStore = createStore({ sessions: firstInstanceSessions, sessionCache });
  const secondStore = createStore({ sessions: secondInstanceSessions, sessionCache });
  const session = await firstStore.createHostedSession({ app: "shopping-lite" });

  const stale = structuredClone(session);
  secondInstanceSessions.set(session.token, stale);

  session.cart.push({ productId: "prod-charger-30w", quantity: 1 });
  await firstStore.persistSessionSnapshot(session);

  const loaded = await secondStore.getSessionByToken(session.token, {} as IncomingMessage);

  assert.deepEqual(loaded?.cart, [{ productId: "prod-charger-30w", quantity: 1 }]);
});
