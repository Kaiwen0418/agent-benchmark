import assert from "node:assert/strict";
import test from "node:test";
import { createHostedViewerToken, verifyHostedViewerToken } from "@agentbench/shared";
import { isHostedViewerMutation } from "./viewer-access.js";

const secret = "viewer-test-secret";
const now = Date.parse("2026-06-12T12:00:00.000Z");

test("hosted viewer token resolves the scoped session before expiry", () => {
  const token = createHostedViewerToken({
    sessionId: "session-1",
    expiresAt: now + 60_000,
    secret,
  });

  assert.deepEqual(verifyHostedViewerToken(token, secret, now), {
    scope: "viewer",
    sessionId: "session-1",
    expiresAt: now + 60_000,
  });
});

test("hosted viewer token rejects tampering and expiry", () => {
  const token = createHostedViewerToken({
    sessionId: "session-1",
    expiresAt: now + 60_000,
    secret,
  });

  assert.equal(verifyHostedViewerToken(`${token}x`, secret, now), null);
  assert.equal(verifyHostedViewerToken(token, secret, now + 60_001), null);
  assert.equal(verifyHostedViewerToken(token, "wrong-secret", now), null);
});

test("hosted viewer access permits reads and rejects mutations", () => {
  const token = createHostedViewerToken({
    sessionId: "session-1",
    expiresAt: Date.now() + 60_000,
    secret,
  });

  assert.equal(isHostedViewerMutation("GET", token, secret), false);
  assert.equal(isHostedViewerMutation("POST", token, secret), true);
  assert.equal(isHostedViewerMutation("DELETE", token, secret), true);
  assert.equal(isHostedViewerMutation("POST", "write-token", secret), false);
});
