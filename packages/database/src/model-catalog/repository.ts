import { eq, inArray, sql } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client.js";
import {
  modelCatalog,
  modelCatalogSyncRuns,
  type JsonValue,
  type ModelCatalogStatus,
  type ModelCatalogSyncStatus,
} from "../schema/index.js";

export type ModelCatalogRecord = {
  provider: string;
  model_id: string;
  display_name: string;
  aliases: string[];
  family: string | null;
  status: ModelCatalogStatus;
  reasoning_efforts: string[];
  released_at: string | null;
  source_refs: JsonValue;
  source_priority: number;
  benchmark_popularity: number;
  last_seen_at: string;
  verified_at: string | null;
};

export type ModelCatalogSyncResult = {
  status: Exclude<ModelCatalogSyncStatus, "running">;
  discoveredCount?: number;
  upsertedCount?: number;
  errorMessage?: string;
  completedAt: string;
};

export type ModelCatalogRepository = {
  startSync: (source: string) => Promise<{ id: string }>;
  listByProviders: (providers: string[]) => Promise<ModelCatalogRecord[]>;
  upsert: (records: ModelCatalogRecord[]) => Promise<void>;
  finishSync: (id: string, result: ModelCatalogSyncResult) => Promise<void>;
};

export function createModelCatalogRepository(db: AgentBenchDatabase): ModelCatalogRepository {
  return {
    async startSync(source) {
      const [row] = await db
        .insert(modelCatalogSyncRuns)
        .values({ source, status: "running" })
        .returning({ id: modelCatalogSyncRuns.id });
      if (!row) throw new Error("Failed to start model catalog sync.");
      return row;
    },

    async listByProviders(providers) {
      if (providers.length === 0) return [];
      const rows = await db
        .select()
        .from(modelCatalog)
        .where(inArray(modelCatalog.provider, providers));
      return rows.map((row) => ({
        provider: row.provider,
        model_id: row.modelId,
        display_name: row.displayName,
        aliases: row.aliases,
        family: row.family,
        status: row.status,
        reasoning_efforts: row.reasoningEfforts,
        released_at: row.releasedAt,
        source_refs: row.sourceRefs,
        source_priority: row.sourcePriority,
        benchmark_popularity: row.benchmarkPopularity,
        last_seen_at: row.lastSeenAt,
        verified_at: row.verifiedAt,
      }));
    },

    async upsert(records) {
      if (records.length === 0) return;
      await db
        .insert(modelCatalog)
        .values(records.map((record) => ({
          provider: record.provider,
          modelId: record.model_id,
          displayName: record.display_name,
          aliases: record.aliases,
          family: record.family,
          status: record.status,
          reasoningEfforts: record.reasoning_efforts,
          releasedAt: record.released_at,
          sourceRefs: record.source_refs,
          sourcePriority: record.source_priority,
          benchmarkPopularity: record.benchmark_popularity,
          lastSeenAt: record.last_seen_at,
          verifiedAt: record.verified_at,
        })))
        .onConflictDoUpdate({
          target: [modelCatalog.provider, modelCatalog.modelId],
          set: {
            displayName: sql`excluded.display_name`,
            aliases: sql`excluded.aliases`,
            family: sql`excluded.family`,
            status: sql`excluded.status`,
            reasoningEfforts: sql`excluded.reasoning_efforts`,
            releasedAt: sql`excluded.released_at`,
            sourceRefs: sql`excluded.source_refs`,
            sourcePriority: sql`excluded.source_priority`,
            benchmarkPopularity: sql`excluded.benchmark_popularity`,
            lastSeenAt: sql`excluded.last_seen_at`,
            verifiedAt: sql`excluded.verified_at`,
          },
        });
    },

    async finishSync(id, result) {
      await db
        .update(modelCatalogSyncRuns)
        .set({
          status: result.status,
          discoveredCount: result.discoveredCount,
          upsertedCount: result.upsertedCount,
          errorMessage: result.errorMessage,
          completedAt: result.completedAt,
        })
        .where(eq(modelCatalogSyncRuns.id, id));
    },
  };
}
