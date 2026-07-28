import type { ModelCatalogOption, ModelCatalogStatus } from "@agentbench/protocol";

export type ModelCatalogSearchCandidate = ModelCatalogOption & {
  sourcePriority: number;
  benchmarkPopularity: number;
};

const statusScore: Record<ModelCatalogStatus, number> = {
  active: 160,
  preview: 120,
  legacy: 40,
  deprecated: 0,
};

export function normalizeModelSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchScore(candidate: ModelCatalogSearchCandidate, normalizedQuery: string) {
  const values = [
    candidate.displayName,
    candidate.modelId,
    candidate.provider,
    ...candidate.aliases,
  ].map(normalizeModelSearchValue);

  let score = 0;
  for (const value of values) {
    if (value === normalizedQuery) {
      score = Math.max(score, 1_000);
    } else if (value.startsWith(normalizedQuery)) {
      score = Math.max(score, 700);
    } else if (value.split(" ").some((token) => token.startsWith(normalizedQuery))) {
      score = Math.max(score, 520);
    } else if (value.includes(normalizedQuery)) {
      score = Math.max(score, 320);
    }
  }

  return score;
}

export function rankModelCatalog(
  candidates: ModelCatalogSearchCandidate[],
  query: string,
  limit = 12,
) {
  const normalizedQuery = normalizeModelSearchValue(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score:
        matchScore(candidate, normalizedQuery) +
        statusScore[candidate.status] +
        Math.max(0, 100 - candidate.sourcePriority) +
        Math.min(100, candidate.benchmarkPopularity),
    }))
    .filter(({ score, candidate }) => score > statusScore[candidate.status] + 200)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightReleasedAt = right.candidate.releasedAt
        ? Date.parse(right.candidate.releasedAt)
        : 0;
      const leftReleasedAt = left.candidate.releasedAt
        ? Date.parse(left.candidate.releasedAt)
        : 0;
      if (rightReleasedAt !== leftReleasedAt) return rightReleasedAt - leftReleasedAt;
      return left.candidate.displayName.localeCompare(right.candidate.displayName);
    })
    .slice(0, Math.max(1, Math.min(limit, 25)))
    .map(({ candidate }) => {
      const { sourcePriority: _sourcePriority, benchmarkPopularity: _benchmarkPopularity, ...option } = candidate;
      return option;
    });
}
