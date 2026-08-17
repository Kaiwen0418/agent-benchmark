import type { ModelCatalogOption } from "@agentbench/protocol";
import type {
  ModelCatalogReadRecord,
  ModelCatalogReadRepository,
} from "@agentbench/database/model-catalog";
import { getWebModelCatalogRepository } from "./database";
import {
  normalizeModelSearchValue,
  rankModelCatalog,
  type ModelCatalogSearchCandidate,
} from "./model-catalog-search";

const MODEL_SEARCH_CANDIDATE_LIMIT = 150;

export function mapModelCatalogRow(row: ModelCatalogReadRecord): ModelCatalogSearchCandidate {
  return {
    provider: row.provider,
    modelId: row.modelId,
    displayName: row.displayName,
    aliases: row.aliases,
    status: row.status,
    reasoningEfforts: row.reasoningEfforts,
    releasedAt: row.releasedAt,
    verifiedAt: row.verifiedAt,
    sourcePriority: row.sourcePriority,
    benchmarkPopularity: row.benchmarkPopularity,
  };
}

export async function searchModelCatalog(
  query: string,
  limit = 12,
  repository: ModelCatalogReadRepository = getWebModelCatalogRepository(),
): Promise<ModelCatalogOption[]> {
  const searchToken = normalizeModelSearchValue(query)
    .split(" ")
    .find((token) => token.length >= 2) ?? null;
  const data = await repository.searchCandidates(searchToken, MODEL_SEARCH_CANDIDATE_LIMIT);

  return rankModelCatalog(data.map(mapModelCatalogRow), query, limit);
}

export async function getModelCatalogOption(
  provider: string,
  modelId: string,
  repository: ModelCatalogReadRepository = getWebModelCatalogRepository(),
): Promise<ModelCatalogOption | null> {
  const data = await repository.findByIdentity(provider, modelId);
  if (!data) {
    return null;
  }

  const { sourcePriority: _sourcePriority, benchmarkPopularity: _benchmarkPopularity, ...option } =
    mapModelCatalogRow(data);
  return option;
}
