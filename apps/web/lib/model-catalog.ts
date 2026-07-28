import type { ModelCatalogOption } from "@agentbench/protocol";
import type { Database } from "@agentbench/shared";
import { createSupabaseAdminClient } from "./supabase/admin";
import {
  normalizeModelSearchValue,
  rankModelCatalog,
  type ModelCatalogSearchCandidate,
} from "./model-catalog-search";

type ModelCatalogRow = Pick<
  Database["public"]["Tables"]["model_catalog"]["Row"],
  | "provider"
  | "model_id"
  | "display_name"
  | "aliases"
  | "status"
  | "reasoning_efforts"
  | "released_at"
  | "verified_at"
  | "source_priority"
  | "benchmark_popularity"
>;

const MODEL_SEARCH_CANDIDATE_LIMIT = 150;

export function mapModelCatalogRow(row: ModelCatalogRow): ModelCatalogSearchCandidate {
  return {
    provider: row.provider,
    modelId: row.model_id,
    displayName: row.display_name,
    aliases: row.aliases,
    status: row.status,
    reasoningEfforts: row.reasoning_efforts,
    releasedAt: row.released_at,
    verifiedAt: row.verified_at,
    sourcePriority: row.source_priority,
    benchmarkPopularity: row.benchmark_popularity,
  };
}

export async function searchModelCatalog(query: string, limit = 12): Promise<ModelCatalogOption[]> {
  const supabase = createSupabaseAdminClient();
  const searchToken = normalizeModelSearchValue(query)
    .split(" ")
    .find((token) => token.length >= 2);
  let catalogQuery = supabase
    .from("model_catalog")
    .select(
      "provider, model_id, display_name, aliases, status, reasoning_efforts, released_at, verified_at, source_priority, benchmark_popularity",
    )
    .order("source_priority", { ascending: true })
    .order("released_at", { ascending: false, nullsFirst: false });
  if (searchToken) {
    catalogQuery = catalogQuery.or(
      `display_name.ilike.%${searchToken}%,model_id.ilike.%${searchToken}%,provider.ilike.%${searchToken}%`,
    );
  }
  const { data, error } = await catalogQuery.limit(MODEL_SEARCH_CANDIDATE_LIMIT);

  if (error) {
    throw error;
  }

  return rankModelCatalog((data ?? []).map(mapModelCatalogRow), query, limit);
}

export async function getModelCatalogOption(
  provider: string,
  modelId: string,
): Promise<ModelCatalogOption | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("model_catalog")
    .select(
      "provider, model_id, display_name, aliases, status, reasoning_efforts, released_at, verified_at, source_priority, benchmark_popularity",
    )
    .eq("provider", provider)
    .eq("model_id", modelId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const { sourcePriority: _sourcePriority, benchmarkPopularity: _benchmarkPopularity, ...option } =
    mapModelCatalogRow(data);
  return option;
}
