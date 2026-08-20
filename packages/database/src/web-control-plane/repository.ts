import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client";
import {
  artifacts,
  benchmarkRuns,
  profiles,
  runEvents,
  type BenchmarkExecutionMode,
  type BenchmarkRunStatus,
  type JsonValue,
} from "../schema/index";

export type BenchmarkRunRecord = typeof benchmarkRuns.$inferSelect;
export type RunEventRecord = typeof runEvents.$inferSelect;
export type ArtifactRecord = typeof artifacts.$inferSelect;
export type BenchmarkRunInsert = typeof benchmarkRuns.$inferInsert;
export type BenchmarkRunUpdate = Partial<Omit<BenchmarkRunInsert, "id" | "caseId">>;

export type WebControlPlaneRepository = {
  createRun: (run: BenchmarkRunInsert, eventPayload: JsonValue) => Promise<BenchmarkRunRecord>;
  listRuns: () => Promise<BenchmarkRunRecord[]>;
  findRun: (runId: string) => Promise<BenchmarkRunRecord | null>;
  listEvents: (runId: string) => Promise<RunEventRecord[]>;
  listArtifacts: (runId: string) => Promise<ArtifactRecord[]>;
  streamFingerprint: (runId: string) => Promise<{
    run: Pick<BenchmarkRunRecord, "id" | "status" | "score" | "errorMessage" | "startedAt" | "completedAt" | "runnerId"> | null;
    lastEventId: string | null;
    lastArtifactId: string | null;
  }>;
  appendEvent: (params: {
    runId: string;
    type: string;
    payload: JsonValue;
    transition?: { status: BenchmarkRunStatus; liveViewUrl?: string; completedAt?: string };
  }) => Promise<{ event: RunEventRecord; run: BenchmarkRunRecord | null }>;
  completeRun: (params: {
    runId: string;
    status: "completed" | "failed" | "cancelled" | "timeout";
    score: number | null;
    errorMessage: string | null;
    completedAt: string;
    artifacts: Array<{ type: string; storagePath: string | null; url: string | null }>;
    completableStatuses: BenchmarkRunStatus[];
  }) => Promise<BenchmarkRunRecord | null>;
  updateRunMetadata: (params: {
    runId: string;
    update: BenchmarkRunUpdate;
    connectedEvent: JsonValue | null;
    terminalStatuses: BenchmarkRunStatus[];
  }) => Promise<BenchmarkRunRecord | null>;
  countRunsSince: (identity: { userId?: string; guestId?: string }, since: string) => Promise<number>;
  findUserDailyLimit: (userId: string) => Promise<number | null>;
};

const fingerprintRunSelection = {
  id: benchmarkRuns.id,
  status: benchmarkRuns.status,
  score: benchmarkRuns.score,
  errorMessage: benchmarkRuns.errorMessage,
  startedAt: benchmarkRuns.startedAt,
  completedAt: benchmarkRuns.completedAt,
  runnerId: benchmarkRuns.runnerId,
};

export function createWebControlPlaneRepository(
  db: AgentBenchDatabase,
): WebControlPlaneRepository {
  return {
    createRun(run, eventPayload) {
      return db.transaction(async (tx) => {
        const [created] = await tx.insert(benchmarkRuns).values(run).returning();
        if (!created) throw new Error("Failed to create benchmark run.");
        await tx.insert(runEvents).values({
          runId: created.id,
          type: "run.created",
          payload: eventPayload,
        });
        return created;
      });
    },

    listRuns() {
      return db.select().from(benchmarkRuns).orderBy(desc(benchmarkRuns.createdAt));
    },

    async findRun(runId) {
      const [row] = await db.select().from(benchmarkRuns).where(eq(benchmarkRuns.id, runId)).limit(1);
      return row ?? null;
    },

    listEvents(runId) {
      return db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.createdAt));
    },

    listArtifacts(runId) {
      return db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(asc(artifacts.createdAt));
    },

    async streamFingerprint(runId) {
      const [runRows, eventRows, artifactRows] = await Promise.all([
        db.select(fingerprintRunSelection).from(benchmarkRuns).where(eq(benchmarkRuns.id, runId)).limit(1),
        db.select({ id: runEvents.id }).from(runEvents).where(eq(runEvents.runId, runId)).orderBy(desc(runEvents.createdAt)).limit(1),
        db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.runId, runId)).orderBy(desc(artifacts.createdAt)).limit(1),
      ]);
      return {
        run: runRows[0] ?? null,
        lastEventId: eventRows[0]?.id ?? null,
        lastArtifactId: artifactRows[0]?.id ?? null,
      };
    },

    appendEvent(params) {
      return db.transaction(async (tx) => {
        const [event] = await tx.insert(runEvents).values({
          runId: params.runId,
          type: params.type,
          payload: params.payload,
        }).returning();
        if (!event) throw new Error("Failed to append run event.");

        let run: BenchmarkRunRecord | null = null;
        if (params.transition) {
          const [updated] = await tx
            .update(benchmarkRuns)
            .set(params.transition)
            .where(eq(benchmarkRuns.id, params.runId))
            .returning();
          run = updated ?? null;
        }
        return { event, run };
      });
    },

    completeRun(params) {
      return db.transaction(async (tx) => {
        const [existing] = await tx.select().from(benchmarkRuns).where(eq(benchmarkRuns.id, params.runId)).limit(1);
        if (!existing) return null;
        if (!params.completableStatuses.includes(existing.status)) return existing;

        const [winner] = await tx
          .update(benchmarkRuns)
          .set({
            status: params.status,
            score: params.score,
            errorMessage: params.errorMessage,
            completedAt: params.completedAt,
          })
          .where(and(
            eq(benchmarkRuns.id, params.runId),
            inArray(benchmarkRuns.status, params.completableStatuses),
          ))
          .returning();

        if (!winner) {
          const [current] = await tx.select().from(benchmarkRuns).where(eq(benchmarkRuns.id, params.runId)).limit(1);
          return current ?? null;
        }
        if (params.artifacts.length > 0) {
          await tx.insert(artifacts).values(params.artifacts.map((artifact) => ({
            runId: params.runId,
            ...artifact,
          })));
        }
        await tx.insert(runEvents).values({
          runId: params.runId,
          type: params.status === "completed" ? "run.completed" : "run.failed",
          payload: { score: params.score, errorMessage: params.errorMessage },
        });
        return winner;
      });
    },

    updateRunMetadata(params) {
      return db.transaction(async (tx) => {
        const [existing] = await tx.select({ status: benchmarkRuns.status }).from(benchmarkRuns)
          .where(eq(benchmarkRuns.id, params.runId)).limit(1);
        if (!existing || params.terminalStatuses.includes(existing.status)) return null;

        const [updated] = await tx.update(benchmarkRuns).set(params.update)
          .where(and(
            eq(benchmarkRuns.id, params.runId),
            eq(benchmarkRuns.status, existing.status),
          ))
          .returning();
        if (!updated) return null;
        if (params.connectedEvent && existing.status === "waiting_for_agent") {
          await tx.insert(runEvents).values({
            runId: params.runId,
            type: "agent.connected",
            payload: params.connectedEvent,
          });
        }
        return updated;
      });
    },

    async countRunsSince(identity, since) {
      const predicate = identity.userId
        ? eq(benchmarkRuns.userId, identity.userId)
        : identity.guestId
          ? eq(benchmarkRuns.guestId, identity.guestId)
          : undefined;
      if (!predicate) return 0;
      const [row] = await db.select({ value: count() }).from(benchmarkRuns)
        .where(and(predicate, gte(benchmarkRuns.createdAt, since)));
      return row?.value ?? 0;
    },

    async findUserDailyLimit(userId) {
      const [row] = await db.select({ limit: profiles.dailyRunLimit }).from(profiles)
        .where(eq(profiles.id, userId)).limit(1);
      return row?.limit ?? null;
    },
  };
}
