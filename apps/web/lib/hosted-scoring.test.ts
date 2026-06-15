import assert from "node:assert/strict";
import test from "node:test";
import { deriveHostedScoring } from "./hosted-scoring.js";

test("deriveHostedScoring reports earned progress across the full suite weight", () => {
  const events = [0, 1, 2, 3].map((sequenceIndex) => ({
    type: "hosted.session.created",
    payload: { sessionId: `session-${sequenceIndex}`, sequenceIndex, weight: 1 },
  }));
  events.push({
    type: "hosted.score",
    payload: {
      sessionId: "session-0",
      sequenceIndex: 0,
      weight: 1,
      score: 1,
      status: "passed",
      summary: "passed",
      evaluators: [],
    },
  });

  const result = deriveHostedScoring(events);
  assert.equal(result.score, 0.25);
  assert.equal(result.sessions.length, 1);
});

test("deriveHostedScoring preserves evaluator failure reasons", () => {
  const result = deriveHostedScoring([
    { type: "hosted.session.created", payload: { sessionId: "session-1", weight: 1 } },
    {
      type: "hosted.score",
      payload: {
        sessionId: "session-1",
        score: 0,
        status: "failed",
        summary: "constraints failed",
        evaluators: [{
          type: "backend_state",
          name: "order constraints",
          score: 0,
          status: "failed",
          required: true,
          errorMessage: "Shipping method did not match.",
        }],
      },
    },
  ]);

  assert.equal(result.sessions[0]?.evaluators[0]?.errorMessage, "Shipping method did not match.");
});
