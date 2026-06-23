import assert from "node:assert/strict";
import test from "node:test";
import { hostedWebSuiteMetadata } from "@agentbench/test-cases";
import { generateAttemptQuestions } from "../../src/question-generation.js";

function readHostedSuiteSeed() {
  return hostedWebSuiteMetadata;
}

test("fresh database seed contains generated question pools without fixed session goals", () => {
  const suite = readHostedSuiteSeed();
  assert.ok(Array.isArray(suite.sessions));
  assert.ok(suite.sessions.length > 0);

  for (const value of suite.sessions) {
    assert.ok(value && typeof value === "object" && !Array.isArray(value));
    const session = value as Record<string, unknown>;
    assert.equal("goal" in session, false, `${String(session.app)} must not define a fixed goal`);
    const metadata = session.metadata as Record<string, unknown>;
    assert.ok(Array.isArray(metadata.questionVariants));
    assert.ok(metadata.questionVariants.length >= 2);
    const ids = metadata.questionVariants.map((variant) => {
      assert.ok(variant && typeof variant === "object" && !Array.isArray(variant));
      const question = variant as Record<string, unknown>;
      assert.equal(typeof question.goal, "string");
      assert.ok(question.taskConfig && typeof question.taskConfig === "object");
      return question.id;
    });
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("wiki question variants declare typed answer contracts", () => {
  const suite = readHostedSuiteSeed();
  assert.equal(suite.suiteVersion, "v3");
  const sessions = suite.sessions as Array<Record<string, unknown>>;
  const wiki = sessions.find((session) => session.app === "wiki-lite");
  assert.ok(wiki);
  assert.equal(wiki.taskVersion, "v2");
  assert.equal(wiki.seedVersion, "wiki-lite-v2");
  const metadata = wiki.metadata as Record<string, unknown>;
  const variants = metadata.questionVariants as Array<Record<string, unknown>>;
  assert.equal(variants.length, 3);
  for (const variant of variants) {
    const config = variant.taskConfig as Record<string, unknown>;
    assert.equal("expectedAnswer" in config, false);
    const contract = config.answerContract as Record<string, unknown>;
    assert.match(String(contract.kind), /^(date|duration|currency|text)$/);
    assert.equal(typeof contract.canonicalValue, "string");
    assert.match(String(contract.normalization), /^(trim|trim-casefold|trim-casefold-punctuation)$/);
    assert.equal(contract.sourceArticleSlug, config.targetArticleSlug);
  }
});

test("scheduled development seeds cover every declared variant", () => {
  const suite = readHostedSuiteSeed();
  const sessions = suite.sessions as Array<Record<string, unknown>>;
  const selectedBySession = new Map<string, Set<string>>();
  for (const seed of ["full-pool-0", "full-pool-1", "full-pool-2", "full-pool-4"]) {
    const generated = generateAttemptQuestions(
      sessions as Parameters<typeof generateAttemptQuestions>[0],
      seed,
    );
    for (const session of generated.sessions) {
      const generation = session.metadata.questionGeneration as Record<string, unknown>;
      const key = `${session.app}/${session.taskSlug}`;
      const selected = selectedBySession.get(key) ?? new Set<string>();
      selected.add(String(generation.variantId));
      selectedBySession.set(key, selected);
    }
  }

  for (const session of sessions) {
    const variants = (session.metadata as Record<string, unknown>).questionVariants as Array<Record<string, unknown>>;
    const key = `${String(session.app)}/${String(session.taskSlug)}`;
    assert.deepEqual(
      selectedBySession.get(key),
      new Set(variants.map((variant) => String(variant.id))),
      key,
    );
  }
});
