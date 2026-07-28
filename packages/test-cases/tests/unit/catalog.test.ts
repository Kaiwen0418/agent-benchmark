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

test("every hosted suite gives each testcase a ten-minute time limit", () => {
  for (const { case: benchmarkCase, metadata } of hostedWebSuites) {
    assert.equal(metadata.timeLimitMinutesPerTestcase, 10, `${benchmarkCase.slug} default time limit`);
    assert.ok(metadata.sessions.every((session) => session.timeLimitMinutes === undefined || session.timeLimitMinutes === 10));
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

test("hard v1.1.0 publishes the seven-session capability campaign", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  assert.equal(suite.suiteVersion, "v1.1.0");
  assert.equal(suite.sessions.length, 7);
  assert.deepEqual(
    suite.sessions.map((session) => session.app),
    ["wiki-lite", "wiki-lite", "sheets-lite", "shopping-lite", "inbox-lite", "notes-lite", "calendar-lite"],
  );
  assert.deepEqual(
    suite.consistencyChecks?.map((check) => ({
      sourceTaskSlug: check.sourceTaskSlug,
      targetTaskSlug: check.targetTaskSlug,
      targetPath: check.targetPath,
      rule: check.rule,
      required: check.required,
    })),
    [
      {
        sourceTaskSlug: "capability-wiki-release-research",
        targetTaskSlug: "capability-evidence-handoff",
        targetPath: "notes[].title",
        rule: "equal-normalized",
        required: true,
      },
      {
        sourceTaskSlug: "capability-wiki-policy-research",
        targetTaskSlug: "capability-policy-revision-message",
        targetPath: "sentMessages[].bodyDigest",
        rule: "target-digest-matches-source",
        required: true,
      },
      {
        sourceTaskSlug: "capability-wiki-policy-research",
        targetTaskSlug: "capability-evidence-handoff",
        targetPath: "notes[].bodyDigest",
        rule: "target-digest-matches-source",
        required: true,
      },
      {
        sourceTaskSlug: "capability-evidence-handoff",
        targetTaskSlug: "capability-coordinated-schedule",
        targetPath: "calendarEvents[].title",
        rule: "equal-normalized",
        required: true,
      },
    ],
  );
});

test("hard v1.1.0 includes versioned sheets and inbox recovery surfaces", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const sheets = suite.sessions.find((session) => session.app === "sheets-lite");
  const inbox = suite.sessions.find((session) => session.app === "inbox-lite");
  assert.ok(sheets);
  assert.equal(sheets.taskVersion, "v2");
  assert.equal(sheets.seedVersion, "sheets-lite-v2");
  assert.ok(inbox);
  assert.equal(inbox.taskVersion, "v2");
  assert.equal(inbox.seedVersion, "inbox-lite-v2");
  assert.ok(inbox.metadata.questionVariants.every((variant) => variant.taskConfig.policyAmendment));
});

test("hard v1.1.0 retains hard research, shopping, and handoff pools", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const wikiSessions = suite.sessions.filter((session) => session.app === "wiki-lite");
  assert.ok(wikiSessions.every((session) => session.seedVersion === "wiki-lite-hard-v2"));
  assert.ok(
    wikiSessions.every((session) =>
      session.metadata.questionVariants.some((variant) => variant.id === "verified-api-rate-limit"),
    ),
  );
  const shopping = suite.sessions.find((session) => session.app === "shopping-lite");
  const notes = suite.sessions.find((session) => session.app === "notes-lite");
  assert.ok(shopping);
  assert.equal(shopping.seedVersion, "shopping-lite-hard-v2");
  assert.ok(shopping.metadata.questionVariants.some((variant) => variant.id === "probook-team-travel-kit"));
  assert.ok(notes);
  assert.equal(notes.seedVersion, "notes-lite-hard-v3");
  const rollout = notes.metadata.questionVariants.find((variant) => variant.id === "release-rollout-note-set");
  assert.ok(rollout);
  assert.equal(rollout.taskConfig.expectedTag, "handoff");
  assert.match(rollout.goal, /fourth handoff note/);
});

test("hard v1.1.0 requires the calendar campaign to reschedule in place", () => {
  const suite = hostedSuiteMetadataSchema.parse(hostedWebHardSuiteMetadata);
  const calendar = suite.sessions.find((session) => session.app === "calendar-lite");
  assert.ok(calendar);
  assert.equal(calendar.taskVersion, "v2");
  assert.equal(calendar.seedVersion, "calendar-lite-campaign-v2");
  assert.ok(
    calendar.metadata.questionVariants.every((variant) => variant.taskConfig.actorUpdate),
  );
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
      targetTaskSlug: "capability-evidence-handoff",
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
      sourceTaskSlug: "capability-evidence-handoff",
      sourcePath: "notes[].title",
      targetTaskSlug: "capability-wiki-release-research",
      targetPath: "latestAnswer.answer",
    },
  ];
  assert.throws(() => hostedSuiteMetadataSchema.parse(invalid));
});
