import assert from "node:assert/strict";
import test from "node:test";
import { parseModelCatalogSource } from "../../src/cli.js";

test("accepts every registered model catalog source", () => {
  for (const source of [
    "openai",
    "anthropic",
    "google",
    "xai",
    "kimi",
    "deepseek",
    "openrouter",
    "litellm",
  ]) {
    assert.equal(parseModelCatalogSource(source), source);
  }
});

test("rejects missing and unknown source names before accessing Supabase", () => {
  assert.throws(() => parseModelCatalogSource(undefined), /Unknown model catalog source/);
  assert.throws(() => parseModelCatalogSource("unknown"), /Unknown model catalog source/);
});
