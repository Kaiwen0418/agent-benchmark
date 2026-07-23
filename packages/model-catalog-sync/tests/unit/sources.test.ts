import assert from "node:assert/strict";
import test from "node:test";
import {
  humanizeModelId,
  modelStatusFromId,
  normalizeModelProvider,
} from "../../src/sources.js";

test("normalizes aggregator provider slugs to catalog owners", () => {
  assert.equal(normalizeModelProvider("x-ai"), "xai");
  assert.equal(normalizeModelProvider("moonshotai"), "moonshot");
  assert.equal(normalizeModelProvider("z-ai"), "zai");
  assert.equal(normalizeModelProvider("gemini"), "google");
});

test("humanizes provider model IDs without losing branded generation punctuation", () => {
  assert.equal(humanizeModelId("gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(humanizeModelId("glm-5.2"), "GLM-5.2");
  assert.equal(humanizeModelId("anthropic/claude-opus-4-7"), "Claude Opus 4 7");
});

test("classifies preview and deprecated identifiers conservatively", () => {
  assert.equal(modelStatusFromId("gemini-3.1-pro-preview"), "preview");
  assert.equal(modelStatusFromId("old-model-deprecated"), "deprecated");
  assert.equal(modelStatusFromId("deepseek-v4"), "active");
});
