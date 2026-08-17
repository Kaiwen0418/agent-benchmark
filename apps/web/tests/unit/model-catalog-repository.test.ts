import assert from "node:assert/strict";
import test from "node:test";
import type {
  ModelCatalogReadRecord,
  ModelCatalogReadRepository,
} from "@agentbench/database/model-catalog";
import {
  getModelCatalogOption,
  searchModelCatalog,
} from "../../lib/model-catalog";

const candidate: ModelCatalogReadRecord = {
  provider: "openai",
  modelId: "gpt-5.6-sol",
  displayName: "GPT-5.6 Sol",
  aliases: ["gpt-5.6"],
  status: "active",
  reasoningEfforts: ["medium", "high"],
  releasedAt: "2026-07-09T00:00:00.000Z",
  verifiedAt: "2026-07-09T00:00:00.000Z",
  sourcePriority: 10,
  benchmarkPopularity: 40,
};

function repository(overrides: Partial<ModelCatalogReadRepository> = {}): ModelCatalogReadRepository {
  return {
    searchCandidates: async () => [candidate],
    findByIdentity: async () => candidate,
    ...overrides,
  };
}

test("catalog search sends a normalized token to the Drizzle repository", async () => {
  let receivedToken: string | null = null;
  let receivedLimit = 0;
  const result = await searchModelCatalog(" GPT-5.6 ", 12, repository({
    async searchCandidates(token, limit) {
      receivedToken = token;
      receivedLimit = limit;
      return [candidate];
    },
  }));

  assert.equal(receivedToken, "gpt");
  assert.equal(receivedLimit, 150);
  assert.equal(result[0]?.modelId, "gpt-5.6-sol");
});

test("catalog identity lookup returns a public option without ranking fields", async () => {
  const option = await getModelCatalogOption("openai", "gpt-5.6-sol", repository());
  assert.equal(option?.displayName, "GPT-5.6 Sol");
  assert.equal(Object.hasOwn(option ?? {}, "sourcePriority"), false);
  assert.equal(Object.hasOwn(option ?? {}, "benchmarkPopularity"), false);
});

test("catalog identity lookup preserves a missing record", async () => {
  const option = await getModelCatalogOption("openai", "missing", repository({
    findByIdentity: async () => null,
  }));
  assert.equal(option, null);
});
