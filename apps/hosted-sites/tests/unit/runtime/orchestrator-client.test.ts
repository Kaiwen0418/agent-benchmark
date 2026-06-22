import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import { buildInitialSessionState, defaultGoalForSession, defaultStartPathForApp } from "../../../src/runtime/app-registry.js";
import { createOrchestratorClient } from "../../../src/runtime/orchestrator-client.js";
import type { HostedSession } from "../../../src/runtime/types.js";

function makeSession(): HostedSession {
  const app = "shopping-lite";
  return {
    id: "session-1",
    token: "token/with space",
    runId: "run-1",
    caseId: "case-1",
    attemptId: "attempt-1",
    callbackSecret: null,
    app,
    suiteSlug: "suite",
    suiteVersion: "v1",
    taskSlug: "shopping-task",
    taskVersion: "v1",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: defaultGoalForSession(app, "shopping-task"),
    startPath: defaultStartPathForApp(app),
    seedVersion: "shopping-lite-v1",
    metadata: {},
    status: "active",
    expiresAt: null,
    accessCount: 3,
    lastAccessedAt: "2026-06-10T10:00:00.000Z",
    firstSeenIp: "10.0.0.1",
    lastSeenIp: "10.0.0.2",
    firstSeenUserAgent: "first-agent",
    lastSeenUserAgent: "last-agent",
    createdAt: "2026-06-10T09:00:00.000Z",
    events: [],
    persisted: true,
    state: buildInitialSessionState(app),
  };
}

test("durable session writes are sent to authenticated orchestrator commands", async () => {
  const requests: Array<{ path: string; secret: string | undefined; body: Record<string, unknown> }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      path: request.url ?? "",
      secret: typeof request.headers["x-runner-secret"] === "string" ? request.headers["x-runner-secret"] : undefined,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"ok":true}');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const session = makeSession();
    const client = createOrchestratorClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      runnerSharedSecret: "shared-secret",
      buildFinalState: () => ({}),
    });
    const accessRequest = {
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "current-agent",
        referer: "https://example.test/task",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await client.persistSessionSnapshot(session, { appState: { cart: [] } });
    await client.recordSessionAccess({ session, request: accessRequest, event: "session.loaded" });
    await client.recordHostedEvent(session, { type: "cart.updated", itemId: "product-1" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  assert.deepEqual(
    requests.map(({ path, secret }) => ({ path, secret })),
    [
      { path: "/api/sessions/token%2Fwith%20space/commands/snapshot", secret: "shared-secret" },
      { path: "/api/sessions/token%2Fwith%20space/commands/access", secret: "shared-secret" },
      { path: "/api/sessions/token%2Fwith%20space/commands/event", secret: "shared-secret" },
    ],
  );
  assert.deepEqual(requests[0]?.body, { metadata: { appState: { cart: [] } } });
  assert.deepEqual(requests[1]?.body, {
    event: "session.loaded",
    accessedAt: "2026-06-10T10:00:00.000Z",
    accessCount: 3,
    firstSeenIp: "10.0.0.1",
    lastSeenIp: "10.0.0.2",
    firstSeenUserAgent: "first-agent",
    lastSeenUserAgent: "last-agent",
    ip: "203.0.113.7",
    userAgent: "current-agent",
    referer: "https://example.test/task",
  });
  assert.deepEqual(requests[2]?.body, {
    payload: { type: "cart.updated", itemId: "product-1" },
  });
});

test("non-persisted sessions never emit durable commands", async () => {
  const session = { ...makeSession(), persisted: false } as HostedSession;
  const client = createOrchestratorClient({
    baseUrl: "http://127.0.0.1:1",
    runnerSharedSecret: "shared-secret",
    buildFinalState: () => ({}),
  });

  assert.equal(await client.persistSessionSnapshot(session, {}), null);
  assert.equal(await client.recordHostedEvent(session, { type: "ignored" }), null);
});
