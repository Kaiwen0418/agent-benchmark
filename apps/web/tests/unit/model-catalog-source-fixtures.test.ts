import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseAnthropicPayload,
  parseGeminiPayload,
  parseLiteLlmPayload,
  parseOpenAiCompatiblePayload,
  parseOpenRouterPayload,
} from "../../lib/model-catalog-sources";

const fixtures = JSON.parse(
  readFileSync(
    new URL("../fixtures/model-catalog-sources.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

test("parses official provider payloads and excludes non-chat models", () => {
  const openai = parseOpenAiCompatiblePayload(fixtures.openAiCompatible, {
    source: "openai",
    provider: "openai",
    sourceUrl: "https://developers.openai.com/api/docs/models",
  });
  const anthropic = parseAnthropicPayload(fixtures.anthropic);
  const gemini = parseGeminiPayload(fixtures.gemini);

  assert.deepEqual(openai.map((model) => model.modelId), ["gpt-5.6-sol"]);
  assert.equal(openai[0]?.verified, true);
  assert.equal(anthropic[0]?.displayName, "Claude Opus 4.7");
  assert.equal(gemini[0]?.modelId, "gemini-3.6-flash");
  assert.equal(gemini[0]?.family, "gemini-3.6");
});

test("normalizes aggregator routes without accepting unrelated providers", () => {
  const openrouter = parseOpenRouterPayload(fixtures.openRouter);
  const litellm = parseLiteLlmPayload(fixtures.liteLlm);

  assert.deepEqual(openrouter.map((model) => [model.provider, model.modelId]), [
    ["xai", "grok-4.2"],
  ]);
  assert.deepEqual(litellm.map((model) => [model.provider, model.modelId]), [
    ["moonshot", "kimi-k3"],
    ["zai", "glm-5.2"],
  ]);
  assert.ok(litellm.every((model) => model.verified === false));
});
