import assert from "node:assert/strict";
import test from "node:test";
import { usePlaygroundStore } from "../../lib/playground-store";

const cancelledRun = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: null,
  guestId: "guest-owner",
  caseId: "00000000-0000-4000-8000-000000000002",
  runnerId: null,
  executionMode: "external-agent",
  status: "cancelled",
  score: null,
  liveViewUrl: null,
  errorMessage: null,
  startedAt: null,
  completedAt: "2026-09-30T12:01:00.000Z",
  createdAt: "2026-09-30T12:00:00.000Z",
  metadata: {},
  agent: null,
  browserEnvironment: null,
  isPublic: true,
};

test("Stop Run ends synchronization only after durable cancellation succeeds", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/cancel")) return Response.json({ run: cancelledRun });
    if (url === "/api/quota") return Response.json({ quota: null });
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    usePlaygroundStore.getState().reset();
    usePlaygroundStore.setState({ currentRunId: cancelledRun.id, phase: "running", streamMode: "sse", score: 0.5 });
    await usePlaygroundStore.getState().stopRun();

    const state = usePlaygroundStore.getState();
    assert.equal(state.phase, "cancelled");
    assert.equal(state.score, null);
    assert.equal(state.streamMode, "idle");
    assert.equal(state.statusLine, "Run cancelled");
    assert.equal(state.cancelling, false);
    assert.deepEqual(requests, [`POST /api/runs/${cancelledRun.id}/cancel`, "GET /api/quota"]);
  } finally {
    globalThis.fetch = previousFetch;
    usePlaygroundStore.getState().reset();
  }
});

test("resuming a cancelled run does not promote partial event scores to a final score", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/events")) return Response.json({ events: [
      { type: "score.updated", payload: { score: 0.5 } },
    ] });
    if (url.endsWith("/artifacts")) return Response.json({ artifacts: [] });
    return Response.json({ run: cancelledRun });
  };

  try {
    usePlaygroundStore.getState().reset();
    await usePlaygroundStore.getState().resumeRun(cancelledRun.id);
    const state = usePlaygroundStore.getState();
    assert.equal(state.phase, "cancelled");
    assert.equal(state.score, null);
    assert.equal(state.streamMode, "idle");
  } finally {
    globalThis.fetch = previousFetch;
    usePlaygroundStore.getState().reset();
  }
});

test("Stop Run keeps synchronization active when durable cancellation fails", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { message: "The run could not be stopped. It is still being monitored." },
    { status: 503 },
  );

  try {
    usePlaygroundStore.getState().reset();
    usePlaygroundStore.setState({ currentRunId: cancelledRun.id, phase: "running", streamMode: "polling" });
    await usePlaygroundStore.getState().stopRun();

    const state = usePlaygroundStore.getState();
    assert.equal(state.phase, "running");
    assert.equal(state.streamMode, "polling");
    assert.equal(state.cancelling, false);
    assert.match(state.runError ?? "", /still being monitored/i);
  } finally {
    globalThis.fetch = previousFetch;
    usePlaygroundStore.getState().reset();
  }
});
