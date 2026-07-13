import assert from "node:assert/strict";
import test from "node:test";
import { negativeRunConnectCacheHeaders } from "../../lib/run-connect-cache";

test("404 responses are cached briefly only by shared caches", () => {
  const headers = negativeRunConnectCacheHeaders(404);

  assert.equal(headers["Cache-Control"], "public, max-age=0, must-revalidate");
  assert.match(headers["CDN-Cache-Control"], /max-age=60/);
  assert.match(headers["Vercel-CDN-Cache-Control"], /stale-while-revalidate=300/);
  assert.equal("RateLimit-Limit" in headers, false);
});

test("terminal run responses receive a longer immutable negative cache window", () => {
  const headers = negativeRunConnectCacheHeaders(410);

  assert.match(headers["CDN-Cache-Control"], /max-age=3600/);
  assert.match(headers["Vercel-CDN-Cache-Control"], /stale-while-revalidate=86400/);
});
