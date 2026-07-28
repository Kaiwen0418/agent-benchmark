import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeModelSearchValue,
  rankModelCatalog,
  type ModelCatalogSearchCandidate,
} from "../../lib/model-catalog-search";

const candidates: ModelCatalogSearchCandidate[] = [
  {
    provider: "openai",
    modelId: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    aliases: ["gpt-5.6"],
    status: "active",
    reasoningEfforts: ["low", "medium", "high"],
    releasedAt: "2026-07-09T00:00:00.000Z",
    verifiedAt: "2026-07-09T00:00:00.000Z",
    sourcePriority: 10,
    benchmarkPopularity: 40,
  },
  {
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    aliases: [],
    status: "legacy",
    reasoningEfforts: [],
    releasedAt: "2024-05-13T00:00:00.000Z",
    verifiedAt: "2024-05-13T00:00:00.000Z",
    sourcePriority: 10,
    benchmarkPopularity: 100,
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet",
    displayName: "Claude Sonnet",
    aliases: [],
    status: "active",
    reasoningEfforts: [],
    releasedAt: null,
    verifiedAt: null,
    sourcePriority: 20,
    benchmarkPopularity: 80,
  },
];

test("normalizes punctuation and case for model autocomplete", () => {
  assert.equal(normalizeModelSearchValue(" GPT-5.6_Sol "), "gpt 5 6 sol");
});

test("ranks current official matches ahead of legacy benchmark-popular matches", () => {
  const result = rankModelCatalog(candidates, "gpt");
  assert.deepEqual(result.map((item) => item.modelId), ["gpt-5.6-sol", "gpt-4o"]);
});

test("matches canonical IDs and display names but excludes unrelated models", () => {
  assert.deepEqual(
    rankModelCatalog(candidates, "claude").map((item) => item.modelId),
    ["claude-sonnet"],
  );
  assert.deepEqual(rankModelCatalog(candidates, "zz"), []);
});

test("requires two characters and respects the result limit", () => {
  assert.deepEqual(rankModelCatalog(candidates, "g"), []);
  assert.equal(rankModelCatalog(candidates, "gpt", 1).length, 1);
});
