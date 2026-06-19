export const LEADERBOARD_PAGE_SIZE = 5;
export const LEADERBOARD_MAX_ENTRIES = 20;

export function paginateLeaderboard<T>(entries: T[], requestedPage: number) {
  const limitedEntries = entries.slice(0, LEADERBOARD_MAX_ENTRIES);
  const pageCount = Math.max(1, Math.ceil(limitedEntries.length / LEADERBOARD_PAGE_SIZE));
  const normalizedPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.min(pageCount, Math.max(1, normalizedPage));
  const start = (page - 1) * LEADERBOARD_PAGE_SIZE;
  const pageEntries = limitedEntries.slice(start, start + LEADERBOARD_PAGE_SIZE);
  const placeholderPositions = Array.from(
    { length: LEADERBOARD_PAGE_SIZE - pageEntries.length },
    (_, index) => start + pageEntries.length + index + 1,
  );

  return {
    entries: limitedEntries,
    page,
    pageCount,
    pageEntries,
    placeholderPositions,
  };
}
