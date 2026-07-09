import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveActiveHostedSessionId,
  deriveActiveHostedViewerUrl,
  deriveHostedViewerRevision,
  deriveHostedViewerUrl,
} from "../../lib/hosted-viewer";

test("hosted viewer follows matching page loads while preserving its token", () => {
  const viewerUrl = deriveHostedViewerUrl([
    {
      type: "hosted.session.created",
      payload: {
        sessionId: "session-1",
        sequenceIndex: 0,
        viewerStartUrl: "https://hosted.example/shopping?session=view-token",
      },
    },
    {
      type: "hosted.page.load",
      payload: {
        sessionId: "session-1",
        url: "/shopping/cart?filter=active",
      },
    },
  ]);

  assert.equal(viewerUrl, "https://hosted.example/shopping/cart?filter=active&session=view-token");
});

test("hosted viewer ignores navigation outside the session app root", () => {
  const viewerUrl = deriveHostedViewerUrl([
    {
      type: "hosted.session.created",
      payload: {
        sessionId: "session-1",
        sequenceIndex: 0,
        viewerStartUrl: "https://hosted.example/forum?session=view-token",
      },
    },
    {
      type: "hosted.page.load",
      payload: {
        sessionId: "session-1",
        url: "/attempts/attempt-1?session=write-token",
      },
    },
  ]);

  assert.equal(viewerUrl, "https://hosted.example/forum?session=view-token");
});

test("hosted viewer follows the first unscored session instead of stale page loads", () => {
  const viewerUrl = deriveActiveHostedViewerUrl(
    [
      {
        type: "hosted.session.created",
        payload: {
          sessionId: "session-1",
          sequenceIndex: 0,
          viewerStartUrl: "https://hosted.example/shopping?session=view-token-1",
        },
      },
      {
        type: "hosted.page.load",
        payload: {
          sessionId: "session-1",
          url: "/shopping/cart?filter=active",
        },
      },
      {
        type: "hosted.session.created",
        payload: {
          sessionId: "session-2",
          sequenceIndex: 1,
          viewerStartUrl: "https://hosted.example/notes?session=view-token-2",
        },
      },
      {
        type: "hosted.score",
        payload: {
          sessionId: "session-1",
          score: 1,
        },
      },
    ],
    "session-2",
  );

  assert.equal(viewerUrl, "https://hosted.example/notes?session=view-token-2");
});

test("derive active hosted session id picks the first created session without a score", () => {
  const activeSessionId = deriveActiveHostedSessionId([
    {
      type: "hosted.session.created",
      payload: { sessionId: "session-1", sequenceIndex: 0 },
    },
    {
      type: "hosted.session.created",
      payload: { sessionId: "session-2", sequenceIndex: 1 },
    },
    {
      type: "hosted.session.created",
      payload: { sessionId: "session-3", sequenceIndex: 2 },
    },
    {
      type: "hosted.score",
      payload: { sessionId: "session-1", score: 1 },
    },
  ]);

  assert.equal(activeSessionId, "session-2");
});

test("derive active hosted session id returns null when all created sessions are scored", () => {
  const activeSessionId = deriveActiveHostedSessionId([
    {
      type: "hosted.session.created",
      payload: { sessionId: "session-1", sequenceIndex: 0 },
    },
    {
      type: "hosted.score",
      payload: { sessionId: "session-1", score: 0 },
    },
  ]);

  assert.equal(activeSessionId, null);
});

test("hosted viewer revision advances only for state-bearing events", () => {
  assert.equal(
    deriveHostedViewerRevision([
      { type: "hosted.action", payload: { type: "click" } },
      { type: "hosted.page.load", payload: {} },
      { type: "hosted.task_signal", payload: {} },
      { type: "hosted.score", payload: {} },
    ]),
    3,
  );
});
