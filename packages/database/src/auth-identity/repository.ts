import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client";
import {
  authSessions,
  authUsers,
  benchmarkRuns,
  hostedWebSessions,
  profiles,
} from "../schema/index";

export type AuthIdentityRepository = {
  ensureProfile: (userId: string) => Promise<void>;
  markEmailVerified: (params: { userId: string; email: string; verifiedAt?: Date }) => Promise<void>;
  claimGuestOwnership: (params: { userId: string; guestId: string }) => Promise<number>;
  deleteIdentity: (userId: string) => Promise<{ anonymizedRuns: number }>;
  deleteExpiredSessions: (now?: Date) => Promise<number>;
};

export function createAuthIdentityRepository(db: AgentBenchDatabase): AuthIdentityRepository {
  return {
    async ensureProfile(userId) {
      await db.insert(profiles).values({ id: userId }).onConflictDoNothing();
    },

    markEmailVerified(params) {
      return db.transaction(async (tx) => {
        await tx
          .update(authUsers)
          .set({
            email: params.email.trim().toLowerCase(),
            emailVerified: params.verifiedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(authUsers.id, params.userId));
        await tx.insert(profiles).values({ id: params.userId }).onConflictDoNothing();
      });
    },

    claimGuestOwnership(params) {
      return db.transaction(async (tx) => {
        await tx.insert(profiles).values({ id: params.userId }).onConflictDoNothing();

        const claimedRuns = await tx
          .update(benchmarkRuns)
          .set({ userId: params.userId, guestId: null })
          .where(and(
            eq(benchmarkRuns.guestId, params.guestId),
            isNull(benchmarkRuns.userId),
          ))
          .returning({ id: benchmarkRuns.id });

        if (claimedRuns.length > 0) {
          await tx
            .update(hostedWebSessions)
            .set({ createdByUserId: params.userId, createdByGuestId: null })
            .where(and(
              inArray(hostedWebSessions.runId, claimedRuns.map((run) => run.id)),
              eq(hostedWebSessions.createdByGuestId, params.guestId),
              isNull(hostedWebSessions.createdByUserId),
            ));
        }

        return claimedRuns.length;
      });
    },

    deleteIdentity(userId) {
      return db.transaction(async (tx) => {
        const ownedRuns = await tx
          .select({ id: benchmarkRuns.id })
          .from(benchmarkRuns)
          .where(eq(benchmarkRuns.userId, userId));

        await tx
          .update(hostedWebSessions)
          .set({
            createdByUserId: null,
            createdByGuestId: sql`'deleted-account:' || ${hostedWebSessions.id}::text`,
          })
          .where(eq(hostedWebSessions.createdByUserId, userId));

        if (ownedRuns.length > 0) {
          const runIds = ownedRuns.map((run) => run.id);
          await tx
            .update(benchmarkRuns)
            .set({
              userId: null,
              guestId: sql`'deleted-account:' || ${benchmarkRuns.id}::text`,
            })
            .where(inArray(benchmarkRuns.id, runIds));
        }

        await tx.delete(authUsers).where(eq(authUsers.id, userId));
        return { anonymizedRuns: ownedRuns.length };
      });
    },

    async deleteExpiredSessions(now = new Date()) {
      const deleted = await db
        .delete(authSessions)
        .where(sql`${authSessions.expires} <= ${now}`)
        .returning({ token: authSessions.sessionToken });
      return deleted.length;
    },
  };
}
