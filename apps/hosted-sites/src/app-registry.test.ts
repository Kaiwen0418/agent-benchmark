import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinalState,
  buildInitialSessionState,
  createAppRouteHandlers,
  defaultGoalForSession,
  defaultStartPathForApp,
  evaluateSession,
  extractHostedAppState,
  getHostedAppDefinition,
  hydrateHostedAppState,
  listHostedAppDefinitions,
} from "./runtime/app-registry.js";
import type { HostedAppRouteDeps } from "./runtime/app-definition.js";
import type { HostedAppId, HostedSessionFor } from "./runtime/types.js";

const expectedApps = ["shopping-lite", "wiki-lite", "forum-lite", "repo-lite"] as const;

function makeSession<TApp extends HostedAppId>(app: TApp): HostedSessionFor<TApp> {
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
    state,
  } as unknown as HostedSessionFor<TApp>;
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

test("app registry builds only the state owned by each app", () => {
  assert.deepEqual(Object.keys(buildInitialSessionState("shopping-lite")).sort(), ["cart", "orders", "products"]);
  assert.deepEqual(Object.keys(buildInitialSessionState("wiki-lite")).sort(), ["wikiAnswerSubmissions", "wikiArticles"]);
  assert.deepEqual(Object.keys(buildInitialSessionState("forum-lite")).sort(), ["moderationActions", "threads"]);
  assert.deepEqual(Object.keys(buildInitialSessionState("repo-lite")).sort(), ["files", "issues", "mergeRequests"]);
});

test("app registry creates isolated state arrays for each session", () => {
  const first = buildInitialSessionState("shopping-lite");
  const second = buildInitialSessionState("shopping-lite");

  first.cart.push({ productId: "product-1", quantity: 1 });
  assert.deepEqual(second.cart, []);
});

test("app registry extracts only state owned by each app", () => {
  const expectedKeys = {
    "shopping-lite": ["cart", "orders", "products"],
    "wiki-lite": ["wikiAnswerSubmissions", "wikiArticles"],
    "forum-lite": ["moderationActions", "threads"],
    "repo-lite": ["files", "issues", "mergeRequests"],
  };

  for (const app of expectedApps) {
    const state = extractHostedAppState(makeSession(app));
    assert.deepEqual(
      Object.keys(state).sort(),
      expectedKeys[app as keyof typeof expectedKeys],
    );
  }
});

test("app registry hydrates persisted forum and repo state", () => {
  const forumState = hydrateHostedAppState("forum-lite", {
    threads: [{ id: "thread-1", title: "Persisted", category: "support", posts: [], locked: true }],
    moderationActions: [{ id: "mod-1", threadId: "thread-1", action: "lock", reason: "persisted" }],
    cart: [{ productId: "ignored", quantity: 1 }],
  });
  const repoState = hydrateHostedAppState("repo-lite", {
    files: [{ path: "README.md", content: "persisted" }],
    issues: [],
    mergeRequests: [{ id: "mr-1", title: "Persisted", changedFiles: [], targetBranch: "main" }],
    threads: [{ id: "ignored" }],
  });

  assert.equal(forumState.threads[0]?.title, "Persisted");
  assert.equal(forumState.moderationActions[0]?.reason, "persisted");
  assert.equal("cart" in forumState, false);
  assert.equal(repoState.files[0]?.content, "persisted");
  assert.equal(repoState.mergeRequests[0]?.title, "Persisted");
  assert.equal("threads" in repoState, false);
});

test("app registry keeps seeded state when legacy metadata omits app fields", () => {
  const state = hydrateHostedAppState("shopping-lite", {
    cart: [{ productId: "prod-charger-30w", quantity: 1 }],
  });

  assert.equal(state.products.length > 0, true);
  assert.deepEqual(state.cart, [{ productId: "prod-charger-30w", quantity: 1 }]);
  assert.deepEqual(state.orders, []);
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
