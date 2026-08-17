import { and, asc, desc, eq } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client";
import {
  benchmarkAttempts,
  hostedWebResults,
  hostedWebSessions,
} from "../schema/index";
import type { JsonValue } from "../schema/model-catalog";

export type HostedAttemptInitialization = {
  attempt: {
    runId: string;
    caseId: string;
    caseRevisionId: string;
    provider: "hosted-web";
    suiteSlug: string;
    suiteVersion: string;
    status: "running";
    metadata: JsonValue;
    startedAt: string;
  };
  sessions: Array<{
    runId: string;
    caseId: string;
    provider: "hosted-web";
    app: string;
    taskSlug: string;
    taskVersion: string;
    sequenceIndex: number;
    weight: number;
    required: boolean;
    seedVersion: string;
    startUrl: string;
    sessionTokenHash: string;
    status: "created" | "active";
    metadata: JsonValue;
    activatedAt: string;
    expiresAt: string | null;
  }>;
};

export type HostedOrchestratorRepository = ReturnType<typeof createHostedOrchestratorRepository>;
export type HostedSessionRecord = typeof hostedWebSessions.$inferSelect;

export function createHostedOrchestratorRepository(db: AgentBenchDatabase) {
  return {
    async findAttemptMetadata(attemptId: string) {
      const [row] = await db.select({ metadata: benchmarkAttempts.metadata })
        .from(benchmarkAttempts)
        .where(eq(benchmarkAttempts.id, attemptId))
        .limit(1);
      return row?.metadata ?? null;
    },

    async findHostedAttempt(runId: string, caseId: string) {
      const [row] = await db.select().from(benchmarkAttempts)
        .where(and(
          eq(benchmarkAttempts.runId, runId),
          eq(benchmarkAttempts.caseId, caseId),
          eq(benchmarkAttempts.provider, "hosted-web"),
        ))
        .orderBy(asc(benchmarkAttempts.createdAt))
        .limit(1);
      return row ?? null;
    },

    createAttemptWithSessions(input: HostedAttemptInitialization) {
      return db.transaction(async (tx) => {
        const [attempt] = await tx.insert(benchmarkAttempts).values(input.attempt).returning();
        if (!attempt) throw new Error("Failed to create hosted attempt.");

        const sessions = await tx.insert(hostedWebSessions).values(
          input.sessions.map((session) => ({ ...session, attemptId: attempt.id })),
        ).returning();
        const firstSession = sessions.reduce<(typeof sessions)[number] | null>(
          (first, session) => !first || session.sequenceIndex < first.sequenceIndex ? session : first,
          null,
        );
        const metadata = {
          ...(attempt.metadata as Record<string, JsonValue>),
          activeSessionId: firstSession?.id ?? null,
          activeSequenceIndex: firstSession?.sequenceIndex ?? null,
          completedSessionIds: [],
        } satisfies Record<string, JsonValue>;
        const [updatedAttempt] = await tx.update(benchmarkAttempts)
          .set({ metadata })
          .where(eq(benchmarkAttempts.id, attempt.id))
          .returning();
        if (!updatedAttempt) throw new Error("Failed to finalize hosted attempt metadata.");
        return { attempt: updatedAttempt, sessions };
      });
    },

    listAttemptSessions(attemptId: string) {
      return db.select().from(hostedWebSessions)
        .where(eq(hostedWebSessions.attemptId, attemptId))
        .orderBy(asc(hostedWebSessions.sequenceIndex));
    },

    async findSessionByTokenHash(sessionTokenHash: string) {
      const [row] = await db.select().from(hostedWebSessions)
        .where(eq(hostedWebSessions.sessionTokenHash, sessionTokenHash))
        .limit(1);
      return row ?? null;
    },

    async findSessionById(sessionId: string) {
      const [row] = await db.select().from(hostedWebSessions)
        .where(eq(hostedWebSessions.id, sessionId))
        .limit(1);
      return row ?? null;
    },

    async updateActiveSessionMetadata(sessionTokenHash: string, metadata: JsonValue) {
      const [row] = await db.update(hostedWebSessions)
        .set({ metadata })
        .where(and(
          eq(hostedWebSessions.sessionTokenHash, sessionTokenHash),
          eq(hostedWebSessions.status, "active"),
        ))
        .returning({ id: hostedWebSessions.id });
      return row?.id ?? null;
    },

    async findLatestSessionResult(sessionId: string) {
      const [row] = await db.select().from(hostedWebResults)
        .where(eq(hostedWebResults.sessionId, sessionId))
        .orderBy(desc(hostedWebResults.createdAt))
        .limit(1);
      return row ?? null;
    },
  };
}
