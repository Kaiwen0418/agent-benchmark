import assert from "node:assert/strict";
import test from "node:test";
import type { BenchmarkCase, BenchmarkRun } from "@agentbench/protocol";
import { recoverExistingHostedWebAttemptConnection } from "../../lib/hosted-web";

const run = { id: "run-1" } as BenchmarkRun;
const benchmarkCase = {
  id: "case-1",
  currentRevisionId: "revision-1",
} as BenchmarkCase;

test("recovers an existing hosted attempt through the orchestrator API", async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.RUNNER_SHARED_SECRET;
  const previousUrl = process.env.HOSTED_ORCHESTRATOR_URL;
  process.env.RUNNER_SHARED_SECRET = "shared-secret";
  process.env.HOSTED_ORCHESTRATOR_URL = "https://hosted.example/orchestrator";

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/orchestrator/api/attempts/connection");
    assert.equal(url.searchParams.get("runId"), "run-1");
    assert.equal(url.searchParams.get("caseId"), "case-1");
    assert.equal(url.searchParams.get("caseRevisionId"), "revision-1");
    assert.equal((init?.headers as Record<string, string>)["x-runner-secret"], "shared-secret");

    return Response.json({
      attemptId: "attempt-1",
      suiteSlug: "hosted-web-suite",
      suiteVersion: "v1",
      metadata: { activeSessionId: "session-1", timeLimitMinutesPerTestcase: 10 },
      sessions: [{
        sessionId: "session-1",
        attemptId: "attempt-1",
        token: "token-1",
        app: "shopping-lite",
        taskSlug: "checkout",
        taskVersion: "v1",
        sequenceIndex: 0,
        weight: 1,
        required: true,
        startUrl: "https://hosted.example/shopping?session=token-1",
        goal: "Complete checkout",
        title: "Checkout",
        status: "active",
      }],
    });
  };

  try {
    const connection = await recoverExistingHostedWebAttemptConnection({ run, benchmarkCase });
    assert.equal(connection?.attemptId, "attempt-1");
    assert.equal(connection?.activeSessionId, "session-1");
    assert.equal(connection?.sessions[0]?.token, "token-1");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.RUNNER_SHARED_SECRET;
    else process.env.RUNNER_SHARED_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.HOSTED_ORCHESTRATOR_URL;
    else process.env.HOSTED_ORCHESTRATOR_URL = previousUrl;
  }
});

test("missing hosted attempts fall through to initialization", async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.RUNNER_SHARED_SECRET;
  process.env.RUNNER_SHARED_SECRET = "shared-secret";
  globalThis.fetch = async () => Response.json({ error: "attempt_not_found" }, { status: 404 });

  try {
    assert.equal(await recoverExistingHostedWebAttemptConnection({ run, benchmarkCase }), null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.RUNNER_SHARED_SECRET;
    else process.env.RUNNER_SHARED_SECRET = previousSecret;
  }
});
