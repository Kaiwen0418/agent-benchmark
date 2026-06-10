import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApiRoutes } from "./api.js";
import { buildInitialSessionState, defaultGoalForSession, defaultStartPathForApp, evaluateSession } from "../runtime/app-registry.js";
import { badRequest, notFound, readJson } from "../runtime/http.js";
import type { HostedSession } from "../runtime/types.js";

function makeSession(): HostedSession {
  const app = "shopping-lite";
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
    taskSlug: "shopping-lite-task",
    taskVersion: "v1",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: defaultGoalForSession(app, "shopping-lite-task"),
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
    persisted: true,
    state: buildInitialSessionState(app),
  };
}

async function withApiServer<T>(handler: (baseUrl: string) => Promise<T>) {
  const requestedTokens: string[] = [];
  const completedSessions: string[] = [];
  const session = makeSession();
  const apiRoutes = createApiRoutes({
    publicBaseUrl: "http://localhost:3003",
    createHostedSession: async () => session,
    getSession: async () => session,
    getSessionByToken: async (token) => {
      requestedTokens.push(token);
      return token === session.token ? session : null;
    },
    recordEvent: async () => undefined,
    forwardRunEvent: async () => undefined,
    telemetryRunEventType: (type) => `hosted.${type}`,
    evaluateSession,
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
