import assert from "node:assert/strict";
import test from "node:test";
import { hostedSuiteMetadataSchema, hostedWebSuiteMetadata } from "./index.js";
import { createHostedWebCatalogRelease } from "./release.js";

test("hosted catalog is valid and has unique app/task definitions", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebSuiteMetadata);
  assert.equal(suite.sessions.length, 4);
  assert.equal(new Set(suite.sessions.map((session) => session.app)).size, suite.sessions.length);
  assert.equal(new Set(suite.sessions.map((session) => session.taskSlug)).size, suite.sessions.length);
  assert.equal(
    suite.sessions.reduce((count, session) => count + session.metadata.questionVariants.length, 0),
    12,
  );
});

test("hosted catalog rejects cross-app task config", () => {
  const invalid = structuredClone(hostedWebSuiteMetadata);
  invalid.sessions[0]!.metadata.questionVariants[0]!.taskConfig = {
    targetThreadId: "thr-battery",
    expectedReplyValue: "https://example.com",
    expectedLockReason: "wrong app",
  } as never;
  assert.throws(() => hostedSuiteMetadataSchema.parse(invalid));
});

test("hosted catalog release has a stable revision identity and content hash", () => {
  const first = createHostedWebCatalogRelease();
  const second = createHostedWebCatalogRelease();

  assert.equal(first.revision, "hosted-web-suite-v2");
  assert.match(first.contentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(second, first);
});
