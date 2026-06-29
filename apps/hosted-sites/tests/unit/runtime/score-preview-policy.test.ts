import assert from "node:assert/strict";
import test from "node:test";
import type { HostedSession } from "../../../src/runtime/types.js";
import {
  isActiveScoreApiAllowed,
  isScorePreviewAllowed,
  parseScorePreviewMode,
  sanitizeScoreResult,
  shouldRenderScorePreview,
} from "../../../src/runtime/score-preview-policy.js";

function makeSession(overrides?: Partial<HostedSession>): HostedSession {
  return {
    id: "session-1",
    token: "tok_1",
    accessMode: "write",
    runId: "run-1",
    caseId: "case-1",
    attemptId: "attempt-1",
    callbackSecret: null,
    app: "shopping-lite",
    suiteSlug: "hosted-web-suite-v1",
    suiteVersion: "v1",
    taskSlug: "shopping-constrained-checkout",
    taskVersion: "v1",
    scorePreviewMode: "dev",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: "Shopping Checkout",
    goal: "Buy a charger",
    startPath: "/shopping",
    seedVersion: "shopping-lite-v1",
    metadata: {},
    status: "active",
    expiresAt: null,
    accessCount: 0,
    lastAccessedAt: null,
    firstSeenIp: null,
    lastSeenIp: null,
    firstSeenUserAgent: null,
    lastSeenUserAgent: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    events: [],
    state: { products: [], cart: [], orders: [] },
    persisted: false,
    ...overrides,
  } as unknown as HostedSession;
}

function makeResult() {
  return {
    score: 1,
    status: "passed" as const,
    summary: "ok",
    evaluators: [
      {
        type: "backend_state" as const,
        name: "order persisted",
        score: 1,
        status: "passed" as const,
        required: true,
        evidence: { orderId: "order-1", secret: "should-be-redacted" },
      },
      {
        type: "retrieve_value" as const,
        name: "answer",
        score: 1,
        status: "passed" as const,
        required: true,
        evidence: { expectedAnswer: "42" },
      },
    ],
  };
}

test("parseScorePreviewMode defaults to dev", () => {
  assert.equal(parseScorePreviewMode(undefined), "dev");
  assert.equal(parseScorePreviewMode(""), "dev");
  assert.equal(parseScorePreviewMode("invalid"), "dev");
});

test("parseScorePreviewMode accepts disabled and token", () => {
  assert.equal(parseScorePreviewMode("disabled"), "disabled");
  assert.equal(parseScorePreviewMode("token"), "token");
});

test("isScorePreviewAllowed is true in dev mode", () => {
  assert.equal(isScorePreviewAllowed(makeSession({ scorePreviewMode: "dev", accessMode: "write" })), true);
  assert.equal(isScorePreviewAllowed(makeSession({ scorePreviewMode: "dev", accessMode: "viewer" })), true);
});

test("isScorePreviewAllowed is false in disabled mode", () => {
  assert.equal(isScorePreviewAllowed(makeSession({ scorePreviewMode: "disabled", accessMode: "write" })), false);
  assert.equal(isScorePreviewAllowed(makeSession({ scorePreviewMode: "disabled", accessMode: "viewer" })), false);
});

test("isScorePreviewAllowed is true in token mode only for viewer sessions", () => {
  assert.equal(isScorePreviewAllowed(makeSession({ scorePreviewMode: "token", accessMode: "write" })), false);
  assert.equal(isScorePreviewAllowed(makeSession({ scorePreviewMode: "token", accessMode: "viewer" })), true);
});

test("isActiveScoreApiAllowed is true for terminal sessions regardless of mode", () => {
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "disabled", status: "completed" })), true);
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "disabled", status: "failed" })), true);
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "disabled", status: "expired" })), true);
});

test("isActiveScoreApiAllowed follows isScorePreviewAllowed for active sessions", () => {
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "dev" })), true);
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "disabled" })), false);
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "token", accessMode: "write" })), false);
  assert.equal(isActiveScoreApiAllowed(makeSession({ scorePreviewMode: "token", accessMode: "viewer" })), true);
});

test("shouldRenderScorePreview is true for terminal sessions regardless of mode", () => {
  assert.equal(shouldRenderScorePreview(makeSession({ scorePreviewMode: "disabled", status: "completed" })), true);
  assert.equal(shouldRenderScorePreview(makeSession({ scorePreviewMode: "disabled", status: "failed" })), true);
});

test("shouldRenderScorePreview follows isScorePreviewAllowed for active sessions", () => {
  assert.equal(shouldRenderScorePreview(makeSession({ scorePreviewMode: "dev" })), true);
  assert.equal(shouldRenderScorePreview(makeSession({ scorePreviewMode: "disabled" })), false);
  assert.equal(shouldRenderScorePreview(makeSession({ scorePreviewMode: "token", accessMode: "write" })), false);
  assert.equal(shouldRenderScorePreview(makeSession({ scorePreviewMode: "token", accessMode: "viewer" })), true);
});

test("sanitizeScoreResult returns full result when preview is allowed", () => {
  const session = makeSession({ scorePreviewMode: "dev" });
  const result = makeResult();
  const sanitized = sanitizeScoreResult(result, session);
  assert.deepEqual(sanitized, result);
  assert.ok("evidence" in sanitized.evaluators[0]!);
});

test("sanitizeScoreResult redacts evidence when preview is not allowed", () => {
  const session = makeSession({ scorePreviewMode: "disabled" });
  const result = makeResult();
  const sanitized = sanitizeScoreResult(result, session);
  assert.equal(sanitized.score, result.score);
  assert.equal(sanitized.status, result.status);
  assert.equal(sanitized.summary, result.summary);
  assert.equal(sanitized.evaluators.length, result.evaluators.length);
  for (const evaluator of sanitized.evaluators) {
    assert.equal("evidence" in evaluator, false);
    assert.equal(typeof evaluator.name, "string");
    assert.equal(typeof evaluator.status, "string");
  }
});

test("sanitizeScoreResult redacts evidence in token mode for non-viewer sessions", () => {
  const session = makeSession({ scorePreviewMode: "token", accessMode: "write" });
  const result = makeResult();
  const sanitized = sanitizeScoreResult(result, session);
  assert.equal("evidence" in sanitized.evaluators[0]!, false);
});

test("sanitizeScoreResult returns full result in token mode for viewer sessions", () => {
  const session = makeSession({ scorePreviewMode: "token", accessMode: "viewer" });
  const result = makeResult();
  const sanitized = sanitizeScoreResult(result, session);
  assert.deepEqual(sanitized, result);
});

test("sanitizeScoreResult defaults to dev when mode is missing", () => {
  const session = makeSession({ scorePreviewMode: undefined });
  const result = makeResult();
  const sanitized = sanitizeScoreResult(result, session);
  assert.deepEqual(sanitized, result);
});
