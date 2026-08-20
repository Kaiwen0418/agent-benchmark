import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client";
import {
  benchmarkAttempts,
  hostedCallbackOutbox,
  hostedWebAccessLogs,
  hostedWebEvents,
  hostedWebResults,
  hostedWebSessions,
  orchestratorCommandDeadLetters,
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

    async findAttempt(attemptId: string) {
      const [row] = await db.select().from(benchmarkAttempts)
        .where(eq(benchmarkAttempts.id, attemptId))
        .limit(1);
      return row ?? null;
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

    listRunSessions(runId: string) {
      return db.select().from(hostedWebSessions)
        .where(eq(hostedWebSessions.runId, runId))
        .orderBy(asc(hostedWebSessions.sequenceIndex));
    },

    listExpiredSessions(cutoff: string, limit: number) {
      return db.select().from(hostedWebSessions)
        .where(and(
          lt(hostedWebSessions.expiresAt, cutoff),
          inArray(hostedWebSessions.status, ["created", "active", "scoring"]),
        ))
        .limit(limit);
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

    recordSessionAccess(input: {
      session: HostedSessionRecord;
      accessCount: number;
      accessedAt: string;
      firstSeenIp: string | null;
      lastSeenIp: string | null;
      firstSeenUserAgent: string | null;
      lastSeenUserAgent: string | null;
      event: string;
      ip: string | null;
      userAgent: string | null;
      referer: string | null;
    }) {
      return db.transaction(async (tx) => {
        const [updated] = await tx.update(hostedWebSessions).set({
          accessCount: input.accessCount,
          lastAccessedAt: input.accessedAt,
          firstSeenIp: input.firstSeenIp,
          lastSeenIp: input.lastSeenIp,
          firstSeenUserAgent: input.firstSeenUserAgent,
          lastSeenUserAgent: input.lastSeenUserAgent,
        }).where(eq(hostedWebSessions.id, input.session.id)).returning({ id: hostedWebSessions.id });
        if (!updated) return false;
        await tx.insert(hostedWebAccessLogs).values({
          sessionId: input.session.id,
          attemptId: input.session.attemptId,
          runId: input.session.runId,
          event: input.event,
          ip: input.ip,
          userAgent: input.userAgent,
          referer: input.referer,
          metadata: { app: input.session.app, taskSlug: input.session.taskSlug },
        });
        return true;
      });
    },

    async appendHostedEvent(input: {
      sessionId: string;
      runId: string;
      attemptId: string | null;
      type: string;
      name: string;
      payload: JsonValue;
    }) {
      const [row] = await db.insert(hostedWebEvents).values(input).returning({ id: hostedWebEvents.id });
      return row?.id ?? null;
    },

    listAttemptEvents(attemptId: string) {
      return db.select().from(hostedWebEvents)
        .where(eq(hostedWebEvents.attemptId, attemptId))
        .orderBy(asc(hostedWebEvents.createdAt));
    },

    async appendExpiryDetectedLogs(sessions: HostedSessionRecord[]) {
      if (sessions.length === 0) return;
      await db.insert(hostedWebAccessLogs).values(sessions.map((session) => ({
        sessionId: session.id,
        attemptId: session.attemptId,
        runId: session.runId,
        event: "session.expiry_detected",
        metadata: { app: session.app, taskSlug: session.taskSlug },
      })));
    },

    async pruneAccessLogsBefore(cutoff: string) {
      const rows = await db.delete(hostedWebAccessLogs)
        .where(lt(hostedWebAccessLogs.createdAt, cutoff))
        .returning({ id: hostedWebAccessLogs.id });
      return rows.length;
    },

    async findLatestSessionResult(sessionId: string) {
      const [row] = await db.select().from(hostedWebResults)
        .where(eq(hostedWebResults.sessionId, sessionId))
        .orderBy(desc(hostedWebResults.createdAt))
        .limit(1);
      return row ?? null;
    },

    listAttemptResults(attemptId: string) {
      return db.select().from(hostedWebResults)
        .where(eq(hostedWebResults.attemptId, attemptId))
        .orderBy(asc(hostedWebResults.createdAt));
    },

    async completeHostedAttemptSession(input: {
      attemptId: string;
      sessionId: string;
      completedAt: string;
      result: JsonValue;
      attemptUpdate: JsonValue;
    }) {
      const queryResult = await db.execute<{ result: JsonValue }>(sql`
        select public.complete_hosted_attempt_session(
          ${input.attemptId}::uuid,
          ${input.sessionId}::uuid,
          ${input.completedAt}::timestamptz,
          ${JSON.stringify(input.result)}::jsonb,
          ${JSON.stringify(input.attemptUpdate)}::jsonb
        ) as result
      `);
      return queryResult.rows[0]?.result ?? null;
    },

    async timeoutHostedAttempt(input: {
      attemptId: string;
      timeoutAt: string;
      timedOutSessionId: string;
      scoringSummary: JsonValue;
    }) {
      const queryResult = await db.execute<{
        transitioned: boolean;
        attempt_run_id: string | null;
        expired_session_ids: string[];
      }>(sql`
        select transitioned, attempt_run_id, expired_session_ids
        from public.timeout_hosted_attempt(
          ${input.attemptId}::uuid,
          ${input.timeoutAt}::timestamptz,
          ${input.timedOutSessionId}::uuid,
          ${JSON.stringify(input.scoringSummary)}::jsonb
        )
      `);
      const row = queryResult.rows[0];
      return row ? {
        transitioned: row.transitioned,
        attemptRunId: row.attempt_run_id,
        expiredSessionIds: row.expired_session_ids,
      } : null;
    },

    async reconcileCallbackOutbox() {
      const result = await db.execute<{ reconciled: number }>(sql`
        select public.reconcile_hosted_callback_outbox() as reconciled
      `);
      return Number(result.rows[0]?.reconciled ?? 0);
    },

    async claimCallbackOutbox(limit: number) {
      const result = await db.execute<{
        id: string;
        attempt_id: string;
        run_id: string;
        event_type: string;
        payload: JsonValue;
        status: "pending" | "delivering" | "delivered" | "dead";
        attempts: number;
        next_attempt_at: string;
        locked_at: string | null;
        delivered_at: string | null;
        last_error: string | null;
        created_at: string;
        updated_at: string;
      }>(sql`select * from public.claim_hosted_callback_outbox(${limit}::integer)`);
      return result.rows.map((row) => ({
        id: row.id,
        attemptId: row.attempt_id,
        runId: row.run_id,
        eventType: row.event_type,
        payload: row.payload,
        status: row.status,
        attempts: row.attempts,
        nextAttemptAt: row.next_attempt_at,
        lockedAt: row.locked_at,
        deliveredAt: row.delivered_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },

    async markCallbackDelivered(id: string, deliveredAt: string) {
      await db.update(hostedCallbackOutbox).set({
        status: "delivered",
        deliveredAt,
        lockedAt: null,
        lastError: null,
        updatedAt: deliveredAt,
      }).where(and(
        eq(hostedCallbackOutbox.id, id),
        eq(hostedCallbackOutbox.status, "delivering"),
      ));
    },

    async markCallbackFailed(input: {
      id: string;
      status: "pending" | "dead";
      nextAttemptAt: string;
      lastError: string;
      updatedAt: string;
    }) {
      await db.update(hostedCallbackOutbox).set({
        status: input.status,
        nextAttemptAt: input.nextAttemptAt,
        lockedAt: null,
        lastError: input.lastError,
        updatedAt: input.updatedAt,
      }).where(and(
        eq(hostedCallbackOutbox.id, input.id),
        eq(hostedCallbackOutbox.status, "delivering"),
      ));
    },

    async upsertCommandDeadLetter(input: typeof orchestratorCommandDeadLetters.$inferInsert) {
      await db.insert(orchestratorCommandDeadLetters).values(input).onConflictDoUpdate({
        target: orchestratorCommandDeadLetters.commandId,
        set: {
          stream: input.stream,
          messageId: input.messageId,
          partition: input.partition,
          partitionKey: input.partitionKey,
          payloadType: input.payloadType,
          payload: input.payload,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          attempts: input.attempts,
          status: input.status,
          scrubbedAt: input.scrubbedAt,
          updatedAt: input.updatedAt,
        },
      });
    },

    listCommandDeadLetters(input: {
      limit: number;
      status?: "dead" | "replayed" | "resolved";
    }) {
      const condition = input.status
        ? eq(orchestratorCommandDeadLetters.status, input.status)
        : undefined;
      return db.select().from(orchestratorCommandDeadLetters)
        .where(condition)
        .orderBy(desc(orchestratorCommandDeadLetters.createdAt))
        .limit(input.limit);
    },

    async findCommandDeadLetter(id: string) {
      const [row] = await db.select().from(orchestratorCommandDeadLetters)
        .where(eq(orchestratorCommandDeadLetters.id, id))
        .limit(1);
      return row ?? null;
    },

    async markCommandDeadLetterReplayed(input: {
      id: string;
      replayCommandId: string;
      replayedAt: string;
    }) {
      const [row] = await db.update(orchestratorCommandDeadLetters).set({
        status: "replayed",
        replayCommandId: input.replayCommandId,
        replayedAt: input.replayedAt,
        updatedAt: input.replayedAt,
      }).where(and(
        eq(orchestratorCommandDeadLetters.id, input.id),
        eq(orchestratorCommandDeadLetters.status, "dead"),
      )).returning({ id: orchestratorCommandDeadLetters.id });
      return Boolean(row);
    },

    async pruneCommandDeadLetters(input: {
      deadBefore: string;
      resolvedBefore: string;
      limit: number;
      maxRows: number;
    }) {
      const result = await db.execute<{ deleted: number }>(sql`
        select public.prune_orchestrator_command_dead_letters_v2(
          ${input.deadBefore}::timestamptz,
          ${input.resolvedBefore}::timestamptz,
          ${input.limit}::integer,
          ${input.maxRows}::integer
        ) as deleted
      `);
      return Number(result.rows[0]?.deleted ?? 0);
    },

    async scrubCommandDeadLetters(limit: number) {
      const result = await db.execute<{ scrubbed: number }>(sql`
        select public.scrub_orchestrator_command_dead_letters(${limit}::integer) as scrubbed
      `);
      return Number(result.rows[0]?.scrubbed ?? 0);
    },
  };
}
