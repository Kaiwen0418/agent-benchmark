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

test("only the hard suite declares cross-app consistency checks", () => {
  assert.equal((hostedWebSuiteMetadata as { consistencyChecks?: unknown[] }).consistencyChecks, undefined);
  const checks = (hostedWebHardSuiteMetadata as { consistencyChecks?: unknown[] }).consistencyChecks ?? [];
  assert.ok(checks.length > 0);
});

test("hard consistency checks reference real sessions with source before target", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const indexBySlug = new Map(suite.sessions.map((session) => [session.taskSlug, session.sequenceIndex]));
  for (const check of suite.consistencyChecks ?? []) {
    const source = indexBySlug.get(check.sourceTaskSlug);
    const target = indexBySlug.get(check.targetTaskSlug);
    assert.ok(source !== undefined, `unknown source ${check.sourceTaskSlug}`);
    assert.ok(target !== undefined, `unknown target ${check.targetTaskSlug}`);
    assert.ok(source! < target!, `${check.sourceTaskSlug} must precede ${check.targetTaskSlug}`);
  }
});

test("schema rejects a consistency check with an unknown task slug", () => {
  const invalid = structuredClone(hostedWebHardSuiteMetadata) as typeof hostedWebHardSuiteMetadata & {
    consistencyChecks: Array<Record<string, unknown>>;
  };
  invalid.consistencyChecks = [
    {
      name: "bad",
      sourceTaskSlug: "does-not-exist",
      sourcePath: "latestAnswer.answer",
      targetTaskSlug: "notes-followup-create-hard",
      targetPath: "notes[].title",
    },
  ];
  assert.throws(() => hostedSuiteMetadataSchema.parse(invalid));
});

test("schema rejects a consistency check whose source follows its target", () => {
  const invalid = structuredClone(hostedWebHardSuiteMetadata) as typeof hostedWebHardSuiteMetadata & {
    consistencyChecks: Array<Record<string, unknown>>;
  };
  invalid.consistencyChecks = [
    {
      name: "reversed",
      sourceTaskSlug: "notes-followup-create-hard",
      sourcePath: "notes[].title",
      targetTaskSlug: "wiki-release-answer-hard",
      targetPath: "latestAnswer.answer",
    },
  ];
  assert.throws(() => hostedSuiteMetadataSchema.parse(invalid));
});
