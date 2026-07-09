import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchHostedSessionSnapshot,
  hostedSessionPollDelay,
  HOSTED_SESSION_MAX_BACKOFF_MS,
  HOSTED_SESSION_POLL_INTERVAL_MS,
  isTerminalRunStatus,
} from "../../lib/hosted-session-polling";

test("hosted session fallback polling starts at 15 seconds and backs off", () => {
  assert.equal(hostedSessionPollDelay(0), HOSTED_SESSION_POLL_INTERVAL_MS);
  assert.equal(hostedSessionPollDelay(1), 30_000);
  assert.equal(hostedSessionPollDelay(2), HOSTED_SESSION_MAX_BACKOFF_MS);
  assert.equal(hostedSessionPollDelay(20), HOSTED_SESSION_MAX_BACKOFF_MS);
});

test("recognizes every terminal run status", () => {
  for (const status of ["completed", "failed", "cancelled", "timeout"]) {
    assert.equal(isTerminalRunStatus(status), true);
  }
  assert.equal(isTerminalRunStatus("running"), false);
});

test("deduplicates concurrent hosted session requests by run", async () => {
  let calls = 0;
  let resolveResponse: ((response: Response) => void) | undefined;
  const fetchFn = (() => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
  }) as typeof fetch;

  const first = fetchHostedSessionSnapshot("run-1", fetchFn);
  const second = fetchHostedSessionSnapshot("run-1", fetchFn);
  assert.equal(first, second);
  assert.equal(calls, 1);

  resolveResponse?.(Response.json({ sessions: [{ sessionId: "session-1", status: "active" }] }));
  assert.deepEqual(await first, [{ sessionId: "session-1", status: "active" }]);
});

test("deduplicates rapid sequential hosted session requests by run", async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return Response.json({ sessions: [] });
  }) as typeof fetch;

  await fetchHostedSessionSnapshot("run-2", fetchFn);
  await fetchHostedSessionSnapshot("run-2", fetchFn);

  assert.equal(calls, 1);
});
