import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client";
import {
  benchmarkCases,
  benchmarkRuns,
  publicHostedRunConsistencyChecks,
  publicHostedRunSummaries,
  publicHostedRunTasks,
} from "../schema/index";

const publicTerminalStatuses = ["completed", "failed", "timeout"] as const;

export type PublicResultReadRepository = ReturnType<typeof createPublicResultReadRepository>;

export function createPublicResultReadRepository(db: AgentBenchDatabase) {
  return {
    async findRun(runId: string) {
      const [row] = await db.select().from(benchmarkRuns).where(and(
        eq(benchmarkRuns.id, runId),
        inArray(benchmarkRuns.status, ["completed", "failed"]),
        eq(benchmarkRuns.isPublic, true),
      )).limit(1);
      return row ?? null;
    },

    async findCase(caseId: string) {
      const [row] = await db.select({
        title: benchmarkCases.title,
        description: benchmarkCases.description,
      }).from(benchmarkCases).where(eq(benchmarkCases.id, caseId)).limit(1);
      return row ?? null;
    },

    async findSummary(runId: string) {
      const [row] = await db.select().from(publicHostedRunSummaries)
        .where(eq(publicHostedRunSummaries.runId, runId)).limit(1);
      return row ?? null;
    },

    listTasks(runId: string) {
      return db.select().from(publicHostedRunTasks)
        .where(eq(publicHostedRunTasks.runId, runId))
        .orderBy(asc(publicHostedRunTasks.createdAt));
    },

    listConsistencyChecks(runId: string) {
      return db.select().from(publicHostedRunConsistencyChecks)
        .where(eq(publicHostedRunConsistencyChecks.runId, runId))
        .orderBy(asc(publicHostedRunConsistencyChecks.sequenceIndex));
    },

    listPublishedCases() {
      return db.select({
        id: benchmarkCases.id,
        slug: benchmarkCases.slug,
        difficulty: benchmarkCases.difficulty,
        metadata: benchmarkCases.metadata,
      }).from(benchmarkCases).where(and(
        eq(benchmarkCases.isPublic, true),
        eq(benchmarkCases.provider, "hosted-web"),
      ));
    },

    listTerminalRunIds(limit: number) {
      return db.select({ id: benchmarkRuns.id }).from(benchmarkRuns).where(and(
        inArray(benchmarkRuns.status, [...publicTerminalStatuses]),
        eq(benchmarkRuns.isPublic, true),
        isNotNull(benchmarkRuns.score),
      )).limit(limit);
    },

    listSummaries(runIds: string[]) {
      if (runIds.length === 0) return Promise.resolve([]);
      return db.select().from(publicHostedRunSummaries)
        .where(inArray(publicHostedRunSummaries.runId, runIds));
    },

    async listRunIdsBySuite(suiteVersions: string[], suiteSlug?: string) {
      if (suiteVersions.length === 0) return [];
      const rows = await db.select({ runId: publicHostedRunSummaries.runId })
        .from(publicHostedRunSummaries)
        .where(and(
          inArray(publicHostedRunSummaries.suiteVersion, suiteVersions),
          suiteSlug ? eq(publicHostedRunSummaries.suiteSlug, suiteSlug) : undefined,
        ))
        .limit(1000);
      return [...new Set(rows.flatMap((row) => row.runId ? [row.runId] : []))];
    },

    listLeaderboardRuns(runIds: string[] | null, limit: number) {
      if (runIds && runIds.length === 0) return Promise.resolve([]);
      return db.select().from(benchmarkRuns).where(and(
        inArray(benchmarkRuns.status, [...publicTerminalStatuses]),
        eq(benchmarkRuns.isPublic, true),
        isNotNull(benchmarkRuns.score),
        runIds ? inArray(benchmarkRuns.id, runIds) : undefined,
      )).orderBy(desc(benchmarkRuns.score)).limit(limit);
    },
  };
}
