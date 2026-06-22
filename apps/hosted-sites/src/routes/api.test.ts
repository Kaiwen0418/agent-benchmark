import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApiRoutes } from "./api.js";
import { createShoppingRoutes } from "./shopping.js";
import { buildInitialSessionState, defaultGoalForSession, defaultStartPathForApp, evaluateSession } from "../runtime/app-registry.js";
import { badRequest, notFound, readForm, readJson, sendJson } from "../runtime/http.js";
import type { HostedSession } from "../runtime/types.js";

function makeSession(accessMode: "write" | "viewer" = "write"): HostedSession {
  const app = "shopping-lite";
  return {
    id: "session-1",
    token: "tok_1",
    accessMode,
    runId: "run-1",
    caseId: "case-1",
    attemptId: "attempt-1",
    callbackSecret: null,
    app,
    suiteSlug: "hosted-web-suite-v1",
    suiteVersion: "v1",
    taskSlug: "shopping-lite-task",
    taskVersion: "v1",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: defaultGoalForSession(app, "shopping-lite-task"),
    startPath: defaultStartPathForApp(app),
    seedVersion: "shopping-lite-v1",
    metadata: {
      questionGeneration: {
        schemaVersion: 1,
        generationSeed: "api-test",
        variantId: "shopping-test",
        uiVariant: "workspace",
        taskConfig: {
          targetCategory: "charger",
          quantity: 1,
          maxTotal: 30,
          shippingMethod: "standard",
          avoidRestricted: true,
        },
      },
    },
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
    persisted: true,
    state: buildInitialSessionState(app),
  };
}

async function withApiServer<T>(
  handler: (baseUrl: string) => Promise<T>,
  accessMode: "write" | "viewer" = "write",
  status: HostedSession["status"] = "active",
) {
  const requestedTokens: string[] = [];
  const completedSessions: string[] = [];
  const forwardedEvents: string[] = [];
  const recordedEvents: string[] = [];
  const session = makeSession(accessMode);
  session.status = status;
  const persistedResult = {
    status: "failed" as const,
    score: 0,
    summary: "first persisted result",
    evaluators: [],
  };
  const apiRoutes = createApiRoutes({
    publicBaseUrl: "http://localhost:3003",
    createHostedSession: async () => session,
    getSession: async () => session,
    getSessionByToken: async (token) => {
      requestedTokens.push(token);
      return token === session.token ? session : null;
    },
    recordEvent: async (_session, payload) => {
      recordedEvents.push(String(payload.type ?? "unknown"));
    },
    forwardRunEvent: async (_session, type) => {
      forwardedEvents.push(type);
    },
    telemetryRunEventType: (type) => `hosted.${type}`,
    evaluateSession,
    resolveSessionResult: async (resolvedSession) =>
      resolvedSession.status === "active" ? evaluateSession(resolvedSession) : persistedResult,
    rejectTerminalMutation: (resolvedSession, response) => {
      if (resolvedSession.status === "active" || resolvedSession.status === "created") return false;
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "session_terminal", status: resolvedSession.status }));
      return true;
    },
    completeSession: async (completedSession, result) => {
      completedSessions.push(completedSession.token);
      return result;
    },
    readJson,
    badRequest,
    notFound,
  });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!(await apiRoutes.handle(request, response, url))) {
      notFound(response);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    return await handler(`http://127.0.0.1:${address.port}`).then((result) => ({
      result,
      requestedTokens,
      completedSessions,
      forwardedEvents,
      recordedEvents,
    }));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("score route resolves sessions through token lookup", async () => {
  const { requestedTokens, result } = await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sessions/tok_1/score`);
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  });

  assert.equal(result.status, 200);
  assert.deepEqual(requestedTokens, ["tok_1"]);
  assert.equal(typeof result.body.score, "number");
});

test("complete route resolves sessions through token lookup", async () => {
  const { requestedTokens, completedSessions, result } = await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sessions/tok_1/complete`, { method: "POST" });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  });

  assert.equal(result.status, 200);
  assert.deepEqual(requestedTokens, ["tok_1"]);
  assert.deepEqual(completedSessions, ["tok_1"]);
  assert.equal(typeof result.body.score, "number");
});

test("terminal score and duplicate completion return the first persisted result", async () => {
  const { completedSessions, result } = await withApiServer(async (baseUrl) => {
    const scoreResponse = await fetch(`${baseUrl}/api/sessions/tok_1/score`);
    const completionResponse = await fetch(`${baseUrl}/api/sessions/tok_1/complete`, { method: "POST" });
    return {
      scoreStatus: scoreResponse.status,
      score: (await scoreResponse.json()) as Record<string, unknown>,
      completionStatus: completionResponse.status,
      completion: (await completionResponse.json()) as Record<string, unknown>,
    };
  }, "write", "failed");

  assert.equal(result.scoreStatus, 200);
  assert.equal(result.completionStatus, 200);
  assert.equal(result.score.summary, "first persisted result");
  assert.deepEqual(result.completion, result.score);
  assert.deepEqual(completedSessions, []);
});

test("terminal telemetry appends no events", async () => {
  const { forwardedEvents, recordedEvents, result } = await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: "tok_1", type: "page.load", url: "/shopping" }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }, "write", "completed");

  assert.equal(result.status, 409);
  assert.equal(result.body.error, "session_terminal");
  assert.deepEqual(recordedEvents, []);
  assert.deepEqual(forwardedEvents, []);
});

test("terminal app mutation returns 409 without changing session state", async () => {
  const session = makeSession();
  if (session.app !== "shopping-lite") throw new Error("Expected shopping session");
  session.status = "failed";
  let snapshots = 0;
  let events = 0;
  const shoppingRoutes = createShoppingRoutes({
    publicBaseUrl: "http://localhost:3003",
    defaultStartPathForApp,
    now: () => "2026-06-01T00:00:00.000Z",
    makeId: (prefix) => `${prefix}_1`,
    getSession: async () => session,
    persistSessionSnapshot: async () => { snapshots += 1; },
    recordEvent: async () => { events += 1; },
    forwardRunEvent: async () => { events += 1; },
    completeSession: async (_session, result) => result,
    evaluateSession,
    resolveSessionResult: async (resolvedSession) => evaluateSession(resolvedSession),
    rejectTerminalMutation: (resolvedSession, response) => {
      if (resolvedSession.status === "active") return false;
      sendJson(response, 409, { error: "session_terminal", status: resolvedSession.status });
      return true;
    },
    readForm,
    badRequest,
    notFound,
  });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!(await shoppingRoutes.handle(request, response, url))) notFound(response);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/shopping/cart?session=tok_1`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ productId: session.state.products[0]!.id }),
    });
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as Record<string, unknown>).error, "session_terminal");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  assert.equal(session.state.cart.length, 0);
  assert.equal(snapshots, 0);
  assert.equal(events, 0);
});

test("viewer token in telemetry body cannot append run events", async () => {
  const { forwardedEvents, recordedEvents, result } = await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: "tok_1",
        type: "page.load",
        url: "/shopping",
      }),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }, "viewer");

  assert.equal(result.status, 403);
  assert.equal(result.body.error, "Viewer sessions are read-only");
  assert.deepEqual(recordedEvents, []);
  assert.deepEqual(forwardedEvents, []);
});

test("viewer token in complete route cannot complete a session", async () => {
  const { completedSessions, requestedTokens, result } = await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sessions/tok_1/complete`, { method: "POST" });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }, "viewer");

  assert.equal(result.status, 403);
  assert.equal(result.body.error, "Viewer sessions are read-only");
  assert.deepEqual(requestedTokens, ["tok_1"]);
  assert.deepEqual(completedSessions, []);
});
