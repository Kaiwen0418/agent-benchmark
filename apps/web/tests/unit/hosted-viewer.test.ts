import assert from "node:assert/strict";
import test from "node:test";
import { deriveHostedViewerRevision, deriveHostedViewerUrl } from "../../lib/hosted-viewer";

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
