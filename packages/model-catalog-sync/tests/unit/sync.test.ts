import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredModel } from "../../src/sources.js";
import {
  createModelCatalogClient,
  deduplicateDiscoveredModels,
  mergeCatalogModel,
} from "../../src/sync.js";

function discovered(overrides: Partial<DiscoveredModel> = {}): DiscoveredModel {
  return {
    provider: "openai",
    modelId: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    aliases: ["gpt-5.6"],
    family: "gpt-5.6",
    status: "active",
    reasoningEfforts: [],
    releasedAt: null,
    source: "openrouter",
    sourceUrl: "https://openrouter.ai/models",
    sourcePriority: 30,
    benchmarkPopularity: 0,
    verified: false,
    ...overrides,
  };
}

test("official data replaces aggregator identity while preserving known capabilities", () => {
  const merged = mergeCatalogModel({
    provider: "openai",
    model_id: "gpt-5.6-sol",
    display_name: "OpenRouter: GPT 5.6",
    aliases: ["openai/gpt-5.6-sol"],
    family: null,
    status: "preview",
    reasoning_efforts: ["medium", "high"],
    released_at: null,
    source_refs: [],
    source_priority: 30,
    benchmark_popularity: 10,
    verified_at: null,
  }, discovered({
    source: "openai",
    sourceUrl: "https://developers.openai.com/api/docs/models",
    sourcePriority: 10,
    verified: true,
  }), "2026-07-23T12:00:00.000Z");

  assert.equal(merged.display_name, "GPT-5.6 Sol");
  assert.equal(merged.source_priority, 10);
  assert.deepEqual(merged.reasoning_efforts, ["medium", "high"]);
  assert.equal(merged.verified_at, "2026-07-23T12:00:00.000Z");
  assert.deepEqual(merged.aliases, ["gpt-5.6", "openai/gpt-5.6-sol"]);
});

test("lower-priority discovery cannot overwrite an official display name", () => {
  const merged = mergeCatalogModel({
    provider: "openai",
    model_id: "gpt-5.6-sol",
    display_name: "GPT-5.6 Sol",
    aliases: [],
    family: "gpt-5.6",
    status: "active",
    reasoning_efforts: ["medium"],
    released_at: null,
    source_refs: [],
    source_priority: 10,
    benchmark_popularity: 0,
    verified_at: "2026-07-09T00:00:00.000Z",
  }, discovered({ displayName: "GPT 5.6", sourcePriority: 40 }), "2026-07-23T12:00:00.000Z");

  assert.equal(merged.display_name, "GPT-5.6 Sol");
  assert.deepEqual(merged.reasoning_efforts, ["medium"]);
});

test("availability discovery does not reactivate a curated legacy model", () => {
  const merged = mergeCatalogModel({
    provider: "openai",
    model_id: "gpt-4o",
    display_name: "GPT-4o",
    aliases: [],
    family: "gpt-4o",
    status: "legacy",
    reasoning_efforts: [],
    released_at: null,
    source_refs: [],
    source_priority: 10,
    benchmark_popularity: 100,
    verified_at: "2026-07-09T00:00:00.000Z",
  }, discovered({
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    family: "gpt-4o",
    source: "openai",
    sourcePriority: 10,
    verified: true,
  }), "2026-07-23T12:00:00.000Z");

  assert.equal(merged.status, "legacy");
});

test("deduplicates aggregator routes before a database upsert", () => {
  const result = deduplicateDiscoveredModels([
    discovered({ aliases: ["openai/gpt-5.6-sol"] }),
    discovered({ aliases: ["openrouter/openai/gpt-5.6-sol"], benchmarkPopularity: 20 }),
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.aliases, [
    "openai/gpt-5.6-sol",
    "openrouter/openai/gpt-5.6-sol",
  ]);
  assert.equal(result[0]?.benchmarkPopularity, 20);
});

test("direct synchronization requires environment-scoped Supabase credentials", () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(
      () => createModelCatalogClient(),
      /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required/,
    );
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
