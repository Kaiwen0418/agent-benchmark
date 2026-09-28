import assert from "node:assert/strict";
import test from "node:test";
import { usePlaygroundStore } from "../../lib/playground-store";

test("resuming a run restores its benchmark selection", async () => {
  const previousFetch = globalThis.fetch;
  const runId = "00000000-0000-4000-8000-000000000001";
  const easyCaseId = "00000000-0000-4000-8000-000000000002";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/events")) return Response.json({ events: [] });
    if (url.endsWith("/artifacts")) return Response.json({ artifacts: [] });
    return Response.json({
      run: {
        id: runId,
        userId: null,
        guestId: "guest-test",
        caseId: easyCaseId,
        runnerId: null,
        executionMode: "external-agent",
        status: "completed",
        score: 1,
        liveViewUrl: null,
        errorMessage: null,
        startedAt: "2026-09-26T10:00:00.000Z",
        completedAt: "2026-09-26T10:01:00.000Z",
        createdAt: "2026-09-26T10:00:00.000Z",
        metadata: {},
        agent: null,
        browserEnvironment: null,
        isPublic: true,
      },
    });
  };

  try {
    usePlaygroundStore.getState().reset();
    usePlaygroundStore.setState({ benchmark: "hard-case" });
    await usePlaygroundStore.getState().resumeRun(runId);
    assert.equal(usePlaygroundStore.getState().benchmark, easyCaseId);
  } finally {
    globalThis.fetch = previousFetch;
    usePlaygroundStore.getState().reset();
  }
});
