import assert from "node:assert/strict";
import test from "node:test";
import { buildInitialSessionState, defaultGoalForSession, defaultStartPathForApp } from "../../../src/runtime/app-registry.js";
import { decodeRedisHostedSession, encodeRedisHostedSession } from "../../../src/runtime/session-cache.js";
import type { HostedSession } from "../../../src/runtime/types.js";

function makeSession(): HostedSession {
  const app = "shopping-lite";
  return {
    id: "session-1",
    token: "tok_1",
    runId: null,
    caseId: null,
    attemptId: null,
    callbackSecret: null,
    app,
    suiteSlug: "hosted-web-suite-v1",
    suiteVersion: "v1",
    taskSlug: "shopping-constrained-checkout",
    taskVersion: "v1",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: defaultGoalForSession(app, "shopping-constrained-checkout"),
    startPath: defaultStartPathForApp(app),
    seedVersion: "shopping-lite-v1",
    metadata: {},
    status: "active",
    expiresAt: null,
    accessCount: 0,
    lastAccessedAt: null,
    firstSeenIp: null,
    lastSeenIp: null,
    firstSeenUserAgent: null,
    lastSeenUserAgent: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    events: [],
    persisted: false,
    state: buildInitialSessionState(app),
  };
}

test("Redis session codec writes a versioned envelope", () => {
  const session = makeSession();
  const encoded = encodeRedisHostedSession(session);
  const parsed = JSON.parse(encoded) as Record<string, unknown>;

  assert.equal(parsed.schemaVersion, 2);
  assert.deepEqual(Object.keys((parsed.session as HostedSession).state).sort(), ["cart", "orders", "products"]);
  assert.deepEqual(decodeRedisHostedSession(encoded), session);
});

function makeLegacyFlatSession(session: HostedSession) {
  const { state, ...core } = session;
  return { ...core, ...state };
}

test("Redis session codec migrates legacy unversioned flat sessions", () => {
  const session = makeSession();
  assert.deepEqual(decodeRedisHostedSession(JSON.stringify(makeLegacyFlatSession(session))), session);
});

test("Redis session codec migrates V1 envelopes", () => {
  const session = makeSession();
  const encoded = JSON.stringify({
    schemaVersion: 1,
    session: {
      ...makeLegacyFlatSession(session),
      threads: [],
      moderationActions: [],
    },
  });
  assert.deepEqual(decodeRedisHostedSession(encoded), session);
});

test("Redis session codec rejects state that does not match the app", () => {
  const session = makeSession();
  assert.throws(
    () => decodeRedisHostedSession(JSON.stringify({ ...session, app: "wiki-lite" })),
    /Invalid Redis hosted session payload/,
  );
});

test("Redis session codec normalizes unknown apps to the fallback app", () => {
  const session = makeSession();
  const decoded = decodeRedisHostedSession(JSON.stringify({ ...session, app: "unknown-app" }));

  assert.equal(decoded.app, "shopping-lite");
  assert.deepEqual(decoded.state, session.state);
});

test("Redis session codec rejects invalid payloads", () => {
  assert.throws(
    () => decodeRedisHostedSession(JSON.stringify({ schemaVersion: 1, session: { id: "broken" } })),
    /Invalid Redis hosted session payload/,
  );
});
