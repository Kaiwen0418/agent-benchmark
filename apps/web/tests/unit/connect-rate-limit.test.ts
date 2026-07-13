import assert from "node:assert/strict";
import test from "node:test";
import { createFixedWindowRateLimiter, getConnectClientAddress } from "../../lib/connect-rate-limit";

test("rejects requests beyond the fixed-window limit", () => {
  let now = 1_000;
  const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });

  assert.equal(limiter.check("run:client").allowed, true);
  assert.equal(limiter.check("run:client").allowed, true);
  const rejected = limiter.check("run:client");
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterSeconds, 60);

  now += 60_000;
  assert.equal(limiter.check("run:client").allowed, true);
});

test("isolates limits by run and client address", () => {
  const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });

  assert.equal(limiter.check("run-a:client-a").allowed, true);
  assert.equal(limiter.check("run-a:client-a").allowed, false);
  assert.equal(limiter.check("run-b:client-a").allowed, true);
  assert.equal(limiter.check("run-a:client-b").allowed, true);
});

test("uses the first forwarded client address", () => {
  const request = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  });

  assert.equal(getConnectClientAddress(request), "203.0.113.7");
});
