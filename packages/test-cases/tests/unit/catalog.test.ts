import assert from "node:assert/strict";
import test from "node:test";
import {
  hostedSuiteMetadataSchema,
  hostedWebHardSuiteCase,
  hostedWebHardSuiteMetadata,
  hostedWebSuiteCase,
  hostedWebSuiteMetadata,
} from "../../src/index.js";
import { createHostedWebCatalogRelease, createHostedWebHardCatalogRelease } from "../../src/release.js";

test("hosted catalog is valid and has unique app/task definitions", () => {
  assert.equal(hostedWebSuiteCase.slug, "hosted-web-suite");
  assert.deepEqual(hostedWebSuiteCase.metadata, {});
  const suite = hostedSuiteMetadataSchema.parse(hostedWebSuiteMetadata);
  assert.ok(suite.sessions.length > 0);
  assert.equal(new Set(suite.sessions.map((session) => session.taskSlug)).size, suite.sessions.length);
  assert.ok(suite.sessions.every((session, index) => session.sequenceIndex === index));
  assert.ok(suite.sessions.every((session) => session.metadata.questionVariants.length >= 2));
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

  assert.equal(first.revision, "hosted-web-suite-v3.0.8");
  assert.match(first.contentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(second, first);
});

test("hosted hard catalog is valid and has unique app/task definitions", () => {
  assert.equal(hostedWebHardSuiteCase.slug, "hosted-web-hard-suite");
  assert.equal(hostedWebHardSuiteCase.difficulty, "hard");
  assert.deepEqual(hostedWebHardSuiteCase.metadata, {});
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  assert.ok(suite.sessions.length > 0);
  assert.equal(new Set(suite.sessions.map((session) => session.taskSlug)).size, suite.sessions.length);
  assert.ok(suite.sessions.every((session, index) => session.sequenceIndex === index));
  assert.ok(suite.sessions.every((session) => session.metadata.questionVariants.length >= 2));
});

test("hosted hard catalog rejects cross-app task config", () => {
  const invalid = structuredClone(hostedWebHardSuiteMetadata);
  invalid.sessions[0]!.metadata.questionVariants[0]!.taskConfig = {
    targetThreadId: "thr-battery",
    expectedReplyValue: "https://example.com",
    expectedLockReason: "wrong app",
  } as never;
  assert.throws(() => hostedSuiteMetadataSchema.parse(invalid));
});

test("hosted hard catalog release has a stable revision identity and content hash", () => {
  const first = createHostedWebHardCatalogRelease();
  const second = createHostedWebHardCatalogRelease();

  assert.equal(first.revision, "hosted-web-hard-suite-v1.0.0");
  assert.match(first.contentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(second, first);
});

test("hosted easy and hard suite cases are distinct", () => {
  assert.notEqual(hostedWebSuiteCase.id, hostedWebHardSuiteCase.id);
  assert.notEqual(hostedWebSuiteCase.slug, hostedWebHardSuiteCase.slug);
  assert.notEqual(hostedWebSuiteMetadata.suiteSlug, hostedWebHardSuiteMetadata.suiteSlug);
});
