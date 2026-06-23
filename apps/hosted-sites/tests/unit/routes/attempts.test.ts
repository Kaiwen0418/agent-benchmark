import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { createAttemptsRoutes } from "../../../src/routes/attempts.js";
import type { HostedSession } from "../../../src/runtime/types.js";

function writeBadRequest(response: ServerResponse, message: string) {
  response.writeHead(400, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: message }));
}

async function withAttemptsServer<T>(
  handler: (baseUrl: string, calls: { getSession: number; resolveAdvance: number }) => Promise<T>,
) {
  const calls = { getSession: 0, resolveAdvance: 0 };
  const session = {
    id: "session-1",
    token: "tok_1",
    attemptId: "attempt-1",
  } as HostedSession;
  const routes = createAttemptsRoutes({
    getSession: async () => {
      calls.getSession += 1;
      return session;
    },
    resolveAdvance: async () => {
      calls.resolveAdvance += 1;
      return {
        attemptId: "attempt-1",
        currentSessionId: "session-1",
        complete: false,
        nextSessionId: "session-2",
        nextStartUrl: "http://localhost:3003/forum?session=tok_2",
      };
    },
    badRequest: writeBadRequest,
  });

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const handled = await routes.handle(request, response, url);
    if (!handled) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    return await handler(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("attempt overview page is not exposed as a second suite navigation surface", async () => {
  await withAttemptsServer(async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/attempts/attempt-1?session=tok_1`);

    assert.equal(response.status, 404);
    assert.equal(calls.getSession, 0);
    assert.equal(calls.resolveAdvance, 0);
  });
});

test("attempt advance API remains available", async () => {
  await withAttemptsServer(async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/attempts/attempt-1/advance?session=tok_1`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(calls.getSession, 1);
    assert.equal(calls.resolveAdvance, 1);
    assert.equal(body.nextSessionId, "session-2");
  });
});
