import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  createDatabaseClient,
  modelCatalogSyncRuns,
  resolveDatabaseUrl,
} from "../../src/index.js";
import { createModelCatalogRepository } from "../../src/model-catalog/index.js";

test("model catalog repository runs against plain PostgreSQL", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-database-integration",
    max: 1,
  });
  const repository = createModelCatalogRepository(client.db);

  try {
    const sync = await repository.startSync("integration-test");
    const seeded = await repository.listByProviders(["openai"]);
    assert.equal(seeded.length, 4);

    await repository.upsert([{
      provider: "integration",
      model_id: "portable-model",
      display_name: "Portable Model",
      aliases: ["portable"],
      family: "portable",
      status: "active",
      reasoning_efforts: ["medium"],
      released_at: null,
      source_refs: [{ source: "integration", url: "https://example.test/models" }],
      source_priority: 10,
      benchmark_popularity: 1,
      last_seen_at: "2026-08-17T00:00:00.000Z",
      verified_at: "2026-08-17T00:00:00.000Z",
    }]);

    const inserted = await repository.listByProviders(["integration"]);
    assert.equal(inserted[0]?.display_name, "Portable Model");

    await repository.finishSync(sync.id, {
      status: "completed",
      discoveredCount: 1,
      upsertedCount: 1,
      completedAt: "2026-08-17T00:00:01.000Z",
    });
    const [completed] = await client.db
      .select()
      .from(modelCatalogSyncRuns)
      .where(eq(modelCatalogSyncRuns.id, sync.id));
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.upsertedCount, 1);
  } finally {
    await client.close();
  }
});
