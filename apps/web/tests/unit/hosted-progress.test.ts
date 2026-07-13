import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHostedSessionProgress,
  deriveHostedSessionProgressFromEvents,
  hasTerminalHostedSessionProgress,
  selectVisibleHostedSessions,
} from "../../lib/hosted-progress";

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

test("hosted connection progress updates active session without reloading connection payload", () => {
  const payload = {
    hostedWeb: {
      activeSessionId: "session-1",
      progress: {
        currentIndex: 0,
        total: 3,
        completed: 0,
      },
      sessions: [
        { sessionId: "session-1", sequenceIndex: 0, status: "active", startUrl: "/one" },
        { sessionId: "session-2", sequenceIndex: 1, status: "created", startUrl: "/two" },
        { sessionId: "session-3", sequenceIndex: 2, status: "created", startUrl: "/three" },
      ],
    },
  };

  const next = applyHostedSessionProgress(payload, [
    { sessionId: "session-1", sequenceIndex: 0, status: "completed" },
    { sessionId: "session-2", sequenceIndex: 1, status: "active" },
    { sessionId: "session-3", sequenceIndex: 2, status: "created" },
  ]);

  assert.equal(next.hostedWeb.activeSessionId, "session-2");
  assert.equal(next.hostedWeb.progress.currentIndex, 1);
  assert.equal(next.hostedWeb.progress.completed, 1);
  assert.equal(next.hostedWeb.sessions[1]?.startUrl, "/two");
});

test("hosted connection progress detects terminal suites", () => {
  assert.equal(hasTerminalHostedSessionProgress([
    { sessionId: "session-1", sequenceIndex: 0, status: "completed" },
    { sessionId: "session-2", sequenceIndex: 1, status: "failed" },
    { sessionId: "session-3", sequenceIndex: 2, status: "expired" },
  ]), true);

  assert.equal(hasTerminalHostedSessionProgress([
    { sessionId: "session-1", sequenceIndex: 0, status: "completed" },
    { sessionId: "session-2", sequenceIndex: 1, status: "active" },
  ]), false);
});

test("hosted progress events expose the latest public session projection", () => {
  const projected = deriveHostedSessionProgressFromEvents([
    {
      type: "hosted.session.progress",
      payload: {
        sessions: [
          {
            sessionId: "session-1",
            taskSlug: "cart",
            status: "completed",
            sequenceIndex: 0,
            expiresAt: null,
            timeLimitMinutes: 10,
          },
        ],
      },
    },
    {
      type: "hosted.session.progress",
      payload: {
        sessions: [
          {
            sessionId: "session-2",
            taskSlug: "wiki",
            status: "active",
            sequenceIndex: 1,
            expiresAt: "2026-07-09T12:00:00.000Z",
            timeLimitMinutes: 10,
          },
          { sessionId: "invalid" },
        ],
      },
    },
  ]);

  assert.deepEqual(projected, [
    {
      sessionId: "session-2",
      taskSlug: "wiki",
      status: "active",
      sequenceIndex: 1,
      expiresAt: "2026-07-09T12:00:00.000Z",
      timeLimitMinutes: 10,
    },
  ]);
});
