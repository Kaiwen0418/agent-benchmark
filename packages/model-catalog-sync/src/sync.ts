import {
  createDatabaseClient,
  resolveDatabaseUrl,
  type DatabaseEnvironment,
} from "@agentbench/database";
import {
  createModelCatalogRepository,
  type JsonValue,
  type ModelCatalogRepository,
} from "@agentbench/database/model-catalog";
import {
  MissingModelSourceCredentialError,
  modelCatalogSources,
  type DiscoveredModel,
  type ModelCatalogSourceName,
} from "./sources.js";

type ExistingCatalogRow = {
  provider: string;
  model_id: string;
  display_name: string;
  aliases: string[];
  family: string | null;
  status: "active" | "preview" | "legacy" | "deprecated";
  reasoning_efforts: string[];
  released_at: string | null;
  source_refs: JsonValue;
  source_priority: number;
  benchmark_popularity: number;
  verified_at: string | null;
};

type SourceRef = {
  source: string;
  url: string;
  lastSeenAt: string;
};

function sourceRefs(value: JsonValue): SourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SourceRef[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = typeof item.source === "string" ? item.source : null;
    const url = typeof item.url === "string" ? item.url : null;
    const lastSeenAt = typeof item.lastSeenAt === "string"
      ? item.lastSeenAt
      : "1970-01-01T00:00:00.000Z";
    return source && url ? [{ source, url, lastSeenAt }] : [];
  });
}

function mergeSourceRefs(existing: JsonValue, discovered: DiscoveredModel, now: string) {
  const refs = sourceRefs(existing).filter((item) => item.source !== discovered.source);
  refs.push({
    source: discovered.source,
    url: discovered.sourceUrl,
    lastSeenAt: now,
  });
  return refs.sort((left, right) => left.source.localeCompare(right.source));
}

export function mergeCatalogModel(
  existing: ExistingCatalogRow | null,
  discovered: DiscoveredModel,
  now: string,
) {
  const replaceIdentity = !existing || discovered.sourcePriority <= existing.source_priority;
  const preserveLifecycleStatus = Boolean(
    existing &&
    (existing.status === "legacy" || existing.status === "deprecated") &&
    discovered.status === "active",
  );
  return {
    provider: discovered.provider,
    model_id: discovered.modelId,
    display_name: replaceIdentity ? discovered.displayName : existing.display_name,
    aliases: [...new Set([...(existing?.aliases ?? []), ...discovered.aliases])].sort(),
    family: replaceIdentity ? discovered.family ?? existing?.family ?? null : existing.family,
    status: preserveLifecycleStatus
      ? existing!.status
      : replaceIdentity
        ? discovered.status
        : existing.status,
    reasoning_efforts:
      discovered.reasoningEfforts.length > 0 && replaceIdentity
        ? discovered.reasoningEfforts
        : existing?.reasoning_efforts ?? [],
    released_at: discovered.releasedAt ?? existing?.released_at ?? null,
    source_refs: mergeSourceRefs(existing?.source_refs ?? [], discovered, now),
    source_priority: Math.min(existing?.source_priority ?? 100, discovered.sourcePriority),
    benchmark_popularity: Math.max(
      existing?.benchmark_popularity ?? 0,
      discovered.benchmarkPopularity,
    ),
    last_seen_at: now,
    verified_at: discovered.verified ? now : existing?.verified_at ?? null,
  };
}

export function deduplicateDiscoveredModels(discovered: DiscoveredModel[]) {
  const byKey = new Map<string, DiscoveredModel>();
  for (const item of discovered) {
    const key = `${item.provider}:${item.modelId}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, item);
      continue;
    }
    const preferred = item.sourcePriority < current.sourcePriority ? item : current;
    byKey.set(key, {
      ...preferred,
      aliases: [...new Set([...current.aliases, ...item.aliases])].sort(),
      reasoningEfforts: [
        ...new Set([...current.reasoningEfforts, ...item.reasoningEfforts]),
      ],
      benchmarkPopularity: Math.max(
        current.benchmarkPopularity,
        item.benchmarkPopularity,
      ),
      verified: current.verified || item.verified,
    });
  }
  return [...byKey.values()];
}

export function createModelCatalogPersistence(
  environment: DatabaseEnvironment = process.env,
) {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(environment, { preferDirect: true }),
    applicationName: "agentbench-model-catalog-sync",
    max: 2,
  });
  return {
    repository: createModelCatalogRepository(client.db),
    close: client.close,
  };
}

async function syncModelCatalogSourceWithRepository(
  source: ModelCatalogSourceName,
  repository: ModelCatalogRepository,
) {
  const syncRun = await repository.startSync(source);

  try {
    const discovered = deduplicateDiscoveredModels(await modelCatalogSources[source]());
    const providers = [...new Set(discovered.map((item) => item.provider))];
    const existingRows = await repository.listByProviders(providers);

    const existingByKey = new Map(
      existingRows.map((row) => [`${row.provider}:${row.model_id}`, row]),
    );
    const now = new Date().toISOString();
    const merged = discovered.map((item) => mergeCatalogModel(
      existingByKey.get(`${item.provider}:${item.modelId}`) ?? null,
      item,
      now,
    ));

    for (let index = 0; index < merged.length; index += 250) {
      const batch = merged.slice(index, index + 250);
      await repository.upsert(batch);
    }

    await repository.finishSync(syncRun.id, {
      status: "completed",
      discoveredCount: discovered.length,
      upsertedCount: merged.length,
      completedAt: now,
    });

    return {
      source,
      status: "completed" as const,
      discoveredCount: discovered.length,
      upsertedCount: merged.length,
    };
  } catch (error) {
    const skipped = error instanceof MissingModelSourceCredentialError;
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Unknown sync error";
    await repository.finishSync(syncRun.id, {
      status: skipped ? "skipped" : "failed",
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });

    if (skipped) {
      return {
        source,
        status: "skipped" as const,
        discoveredCount: 0,
        upsertedCount: 0,
        message,
      };
    }
    throw error;
  }
}

export async function syncModelCatalogSource(
  source: ModelCatalogSourceName,
  repository?: ModelCatalogRepository,
) {
  if (repository) {
    return syncModelCatalogSourceWithRepository(source, repository);
  }

  const persistence = createModelCatalogPersistence();
  try {
    return await syncModelCatalogSourceWithRepository(source, persistence.repository);
  } finally {
    await persistence.close();
  }
}
