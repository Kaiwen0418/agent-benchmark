import assert from "node:assert/strict";
import test from "node:test";
import { paginateLeaderboard } from "./leaderboard-pagination";

test("limits leaderboard pagination to the top 20 entries", () => {
  const result = paginateLeaderboard(Array.from({ length: 24 }, (_, index) => index + 1), 4);

  assert.equal(result.entries.length, 20);
  assert.equal(result.pageCount, 4);
  assert.deepEqual(result.pageEntries, [16, 17, 18, 19, 20]);
  assert.deepEqual(result.placeholderPositions, []);
});

test("fills a short leaderboard page with placeholders", () => {
  const result = paginateLeaderboard([1, 2, 3], 1);

  assert.deepEqual(result.pageEntries, [1, 2, 3]);
  assert.deepEqual(result.placeholderPositions, [4, 5]);
});

test("fills the final partial page and clamps an invalid page", () => {
  const result = paginateLeaderboard([1, 2, 3, 4, 5, 6, 7], 99);

  assert.equal(result.page, 2);
  assert.deepEqual(result.pageEntries, [6, 7]);
  assert.deepEqual(result.placeholderPositions, [8, 9, 10]);
});
