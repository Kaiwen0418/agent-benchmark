import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinalState,
  buildInitialSessionState,
  createAppRouteHandlers,
  defaultGoalForSession,
  defaultStartPathForApp,
  evaluateSession,
  getHostedAppDefinition,
  listHostedAppDefinitions,
} from "./runtime/app-registry.js";
import type { HostedAppRouteDeps } from "./runtime/app-definition.js";
import type { HostedSession } from "./runtime/types.js";

const expectedApps = ["shopping-lite", "wiki-lite", "forum-lite", "repo-lite"];

function makeSession(app: string): HostedSession {
  const state = buildInitialSessionState(app);
  return {
    id: "session-1",
    token: "tok_1",
    runId: "run-1",
    caseId: "case-1",
    attemptId: "attempt-1",
    callbackSecret: null,
    app,
    suiteSlug: "hosted-web-suite-v1",
    suiteVersion: "v1",
    taskSlug: `${app}-task`,
    taskVersion: "v1",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: defaultGoalForSession(app, `${app}-task`),
    startPath: defaultStartPathForApp(app),
    seedVersion: `${app}-v1`,
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
    ...state,
  };
}

function makeRouteDeps(): HostedAppRouteDeps {
  return {
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp,
    now: () => "2026-06-01T00:00:00.000Z",
    makeId: (prefix) => `${prefix}_1`,
    getSession: async () => null,
    persistSessionSnapshot: async () => undefined,
    recordEvent: async () => undefined,
    forwardRunEvent: async () => undefined,
    completeSession: async () => null,
    evaluateSession,
    readForm: async () => new URLSearchParams(),
    badRequest: () => undefined,
    notFound: () => undefined,
  };
}

test("app registry exposes every hosted app definition", () => {
  const definitions = listHostedAppDefinitions();
  assert.deepEqual(
    definitions.map((definition) => definition.id),
    expectedApps,
  );

  for (const app of expectedApps) {
    const definition = getHostedAppDefinition(app);
    assert.equal(definition.id, app);
    assert.match(defaultStartPathForApp(app), /^\//);
    assert.ok(defaultGoalForSession(app, `${app}-task`).length > 0);
  }
});

test("app registry builds complete initial session state for every app", () => {
  for (const app of expectedApps) {
    const state = buildInitialSessionState(app);
    assert.ok(Array.isArray(state.products));
    assert.ok(Array.isArray(state.cart));
    assert.ok(Array.isArray(state.orders));
    assert.ok(Array.isArray(state.wikiArticles));
    assert.ok(Array.isArray(state.wikiAnswerSubmissions));
    assert.ok(Array.isArray(state.threads));
    assert.ok(Array.isArray(state.moderationActions));
    assert.ok(Array.isArray(state.files));
    assert.ok(Array.isArray(state.issues));
    assert.ok(Array.isArray(state.mergeRequests));
  }
});

test("app registry composes one route handler per hosted app", () => {
  const handlers = createAppRouteHandlers(makeRouteDeps());
  assert.equal(handlers.length, expectedApps.length);
  assert.ok(handlers.every((handler) => typeof handler === "function"));
});

test("app registry dispatches evaluation and final state through definitions", () => {
  for (const app of expectedApps) {
    const session = makeSession(app);
    const result = evaluateSession(session);
    const finalState = buildFinalState(session);

    assert.ok(result.summary.length > 0);
    assert.equal(typeof result.score, "number");
    assert.equal((finalState as { app?: string }).app, app);
  }
});
