import assert from "node:assert/strict";
import test from "node:test";
import { resolveHostedSitesUrls } from "../../src/service-urls.js";

test("hosted browser URLs prefer the public origin over the internal service origin", () => {
  assert.deepEqual(
    resolveHostedSitesUrls({
      HOSTED_SITES_URL: "http://hosted-sites:3003",
      HOSTED_SITES_PUBLIC_URL: "https://hosted-test.project-echo.xyz/",
    }),
    {
      internalBaseUrl: "http://hosted-sites:3003",
      publicBaseUrl: "https://hosted-test.project-echo.xyz",
    },
  );
});

test("hosted browser URLs fall back to the service origin for local development", () => {
  assert.deepEqual(resolveHostedSitesUrls({ HOSTED_SITES_URL: "http://localhost:4011/" }), {
    internalBaseUrl: "http://localhost:4011",
    publicBaseUrl: "http://localhost:4011",
  });
});
