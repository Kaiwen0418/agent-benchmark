import assert from "node:assert/strict";
import test from "node:test";
import {
  hostedSuiteMetadataSchema,
  hostedWebHardSuiteMetadata,
  hostedWebSuites,
} from "../../src/index.js";
import { createCatalogRelease } from "../../src/release.js";

test("every hosted suite catalog is valid and has unique app/task definitions", () => {
  for (const { case: benchmarkCase, metadata } of hostedWebSuites) {
    assert.deepEqual(benchmarkCase.metadata, {}, `${benchmarkCase.slug} case metadata`);
    const suite = hostedSuiteMetadataSchema.parse(metadata);
    assert.ok(suite.sessions.length > 0, `${benchmarkCase.slug} has sessions`);
    assert.equal(
      new Set(suite.sessions.map((session) => session.taskSlug)).size,
      suite.sessions.length,
      `${benchmarkCase.slug} task slugs unique`,
    );
    assert.ok(suite.sessions.every((session, index) => session.sequenceIndex === index));
    assert.ok(suite.sessions.every((session) => session.metadata.questionVariants.length >= 2));
  }
});

test("every hosted suite catalog rejects cross-app task config", () => {
  for (const { case: benchmarkCase, metadata } of hostedWebSuites) {
    const invalid = structuredClone(metadata);
    invalid.sessions[0]!.metadata.questionVariants[0]!.taskConfig = {
      targetThreadId: "thr-battery",
      expectedReplyValue: "https://example.com",
      expectedLockReason: "wrong app",
    } as never;
    assert.throws(() => hostedSuiteMetadataSchema.parse(invalid), `${benchmarkCase.slug} rejects cross-app config`);
  }
});

test("every hosted suite catalog release has a stable revision identity and content hash", () => {
  for (const suite of hostedWebSuites) {
    const first = createCatalogRelease(suite);
    const second = createCatalogRelease(suite);

    assert.equal(first.revision, suite.revision);
    assert.equal(first.caseId, suite.case.id);
    assert.match(first.contentHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(second, first);
  }
});

test("every hosted suite declares a positive per-testcase time limit", () => {
  for (const { case: benchmarkCase, metadata } of hostedWebSuites) {
    assert.ok(
      typeof metadata.timeLimitMinutesPerTestcase === "number" && metadata.timeLimitMinutesPerTestcase > 0,
      `${benchmarkCase.slug} declares a positive timeLimitMinutesPerTestcase`,
    );
  }
});

test("hosted suite cases have distinct ids, slugs, and suite slugs", () => {
  const ids = hostedWebSuites.map((suite) => suite.case.id);
  const slugs = hostedWebSuites.map((suite) => suite.case.slug);
  const suiteSlugs = hostedWebSuites.map((suite) => suite.metadata.suiteSlug);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(new Set(suiteSlugs).size, suiteSlugs.length);
});

test("difficulty is a tag: only hard suites declare cross-app consistency checks", () => {
  for (const { case: benchmarkCase, metadata } of hostedWebSuites) {
    const checks = (metadata as { consistencyChecks?: unknown[] }).consistencyChecks ?? [];
    if (benchmarkCase.difficulty === "hard") {
      assert.ok(checks.length > 0, `${benchmarkCase.slug} declares consistency checks`);
    } else {
      assert.equal(checks.length, 0, `${benchmarkCase.slug} declares no consistency checks`);
    }
  }
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

test("hard v1.0.2 requires both wiki answers to be carried into distinct note fields", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  assert.equal(suite.suiteVersion, "v1.0.2");
  assert.deepEqual(
    suite.consistencyChecks?.map((check) => ({
      sourceTaskSlug: check.sourceTaskSlug,
      targetPath: check.targetPath,
      required: check.required,
    })),
    [
      {
        sourceTaskSlug: "wiki-release-answer-hard",
        targetPath: "notes[].title",
        required: true,
      },
      {
        sourceTaskSlug: "wiki-policy-answer-hard",
        targetPath: "notes[].body",
        required: true,
      },
    ],
  );
});

test("hard v1.0.2 includes combined-constraint shopping variants on the v2 seed", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const shopping = suite.sessions.find((session) => session.app === "shopping-lite");
  assert.ok(shopping);
  assert.equal(shopping.taskVersion, "v3");
  assert.equal(shopping.seedVersion, "shopping-lite-hard-v2");
  const variantIds = shopping.metadata.questionVariants.map((variant) => variant.id);
  assert.ok(variantIds.includes("probook-team-travel-kit"));
  assert.ok(variantIds.includes("airlite-field-kit"));
});

test("hard v1.0.2 includes ordered forum escalation on the v2 seed", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const forum = suite.sessions.find((session) => session.app === "forum-lite");
  assert.ok(forum);
  assert.equal(forum.taskVersion, "v3");
  assert.equal(forum.seedVersion, "forum-lite-hard-v2");
  assert.ok(
    forum.metadata.questionVariants.some((variant) => variant.id === "hot-charge-full-escalation"),
  );
});

test("hard v1.0.2 includes conflict-aware repo workflow on the v2 seed", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const repo = suite.sessions.find((session) => session.app === "repo-lite");
  assert.ok(repo);
  assert.equal(repo.taskVersion, "v3");
  assert.equal(repo.seedVersion, "repo-lite-hard-v2");
  assert.ok(repo.metadata.questionVariants.some((variant) => variant.id === "api-v3-conflict-rollout"));
});

test("hard v1.0.2 includes three-article wiki verification on the v2 seed", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const wikiSessions = suite.sessions.filter((session) => session.app === "wiki-lite");
  assert.ok(wikiSessions.every((session) => session.seedVersion === "wiki-lite-hard-v2"));
  assert.ok(
    wikiSessions.every((session) =>
      session.metadata.questionVariants.some((variant) => variant.id === "verified-api-rate-limit"),
    ),
  );
});

test("hard v1.0.2 includes a multi-record notes workflow on the v2 seed", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const notes = suite.sessions.find((session) => session.app === "notes-lite");
  assert.ok(notes);
  assert.equal(notes.taskVersion, "v3");
  assert.equal(notes.seedVersion, "notes-lite-hard-v2");
  assert.ok(notes.metadata.questionVariants.some((variant) => variant.id === "release-rollout-note-set"));
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
