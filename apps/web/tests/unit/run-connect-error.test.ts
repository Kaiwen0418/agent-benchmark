import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRunConnectFailure,
  connectRetryDelaySeconds,
  parseRetryAfter,
} from "../../lib/run-connect-error";

test("404 and 410 connection failures cannot be retried", () => {
  for (const status of [404, 410]) {
    const failure = buildRunConnectFailure(status, new Headers(), null);
    assert.equal(failure.retryable, false);
    assert.equal(connectRetryDelaySeconds(failure), null);
  }
});

test("429 connection failures honor Retry-After seconds", () => {
  const now = 10_000;
  const failure = buildRunConnectFailure(
    429,
    new Headers({ "retry-after": "12" }),
    { error: "rate_limited", message: "Wait." },
    now,
  );

  assert.equal(failure.retryable, true);
  assert.equal(failure.retryAt, 22_000);
  assert.equal(connectRetryDelaySeconds(failure, now), 12);
  assert.equal(connectRetryDelaySeconds(failure, 22_000), 0);
});

test("parses an HTTP-date Retry-After value", () => {
  assert.equal(
    parseRetryAfter("Thu, 09 Jul 2026 12:00:00 GMT", Date.parse("Thu, 09 Jul 2026 11:59:50 GMT")),
    Date.parse("Thu, 09 Jul 2026 12:00:00 GMT"),
  );
});
