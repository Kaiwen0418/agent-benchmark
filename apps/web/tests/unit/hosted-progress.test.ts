import assert from "node:assert/strict";
import test from "node:test";
import { selectVisibleHostedSessions } from "../../lib/hosted-progress";

const sessions = [
  { sessionId: "session-1" },
  { sessionId: "session-2" },
  { sessionId: "session-3" },
];

test("active runs show only the current hosted session", () => {
  assert.deepEqual(selectVisibleHostedSessions("booting", sessions, "session-1"), [sessions[0]]);
  assert.deepEqual(selectVisibleHostedSessions("running", sessions, "session-2"), [sessions[1]]);
});

test("terminal runs retain the full hosted session breakdown", () => {
  assert.deepEqual(selectVisibleHostedSessions("completed", sessions, null), sessions);
  assert.deepEqual(selectVisibleHostedSessions("failed", sessions, null), sessions);
});

test("active runs fall back safely when the current session is unavailable", () => {
  assert.deepEqual(selectVisibleHostedSessions("booting", sessions, "missing"), sessions);
});
