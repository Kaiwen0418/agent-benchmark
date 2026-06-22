import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const seedSql = fs.readFileSync(path.join(root, "supabase/seed.sql"), "utf8");
const migrationSql = [
  "20260611000010_add_hosted_question_variants.sql",
  "20260622000018_add_wiki_answer_contracts.sql",
].map((file) => fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8")).join("\n");

function readHostedSuiteSeed() {
  const jsonValues = [...seedSql.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((match) =>
    JSON.parse(match[1].replaceAll("''", "'")) as Record<string, unknown>,
  );
  const suite = jsonValues.find((value) => value.suiteSlug === "hosted-web-suite-v1");
  assert.ok(suite, "hosted-web suite metadata must exist in supabase/seed.sql");
  return suite;
}

test("fresh database seed contains generated question pools without fixed session goals", () => {
  const suite = readHostedSuiteSeed();
  assert.ok(Array.isArray(suite.sessions));
  assert.equal(suite.sessions.length, 4);

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

test("production data migration contains every seeded question variant", () => {
  const suite = readHostedSuiteSeed();
  const sessions = suite.sessions as Array<Record<string, unknown>>;
  for (const session of sessions) {
    const metadata = session.metadata as Record<string, unknown>;
    for (const value of metadata.questionVariants as Array<Record<string, unknown>>) {
      assert.match(migrationSql, new RegExp(`"id"\\s*:\\s*"${String(value.id)}"`));
    }
  }
});

test("wiki question variants declare typed answer contracts", () => {
  const suite = readHostedSuiteSeed();
  assert.equal(suite.suiteVersion, "v2");
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
    assert.match(String(contract.kind), /^(date|duration|currency)$/);
    assert.equal(typeof contract.canonicalValue, "string");
    assert.match(String(contract.normalization), /^(trim|trim-casefold|trim-casefold-punctuation)$/);
    assert.equal(contract.sourceArticleSlug, config.targetArticleSlug);
  }
});
