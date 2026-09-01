import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  authSessions,
  authUsers,
  benchmarkCases,
  benchmarkRuns,
  createDatabaseClient,
  hostedWebSessions,
  profiles,
  resolveDatabaseUrl,
} from "../../src/index.js";
import { createAuthIdentityRepository } from "../../src/auth-identity/index.js";

test("identity repository claims only one guest and anonymizes ownership on deletion", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-auth-identity-integration",
    max: 1,
  });
  const repository = createAuthIdentityRepository(client.db);
  const firstUserId = crypto.randomUUID();
  const secondUserId = crypto.randomUUID();
  const guestId = crypto.randomUUID();

  try {
    await client.db.insert(authUsers).values([
      { id: firstUserId, email: `first-${crypto.randomUUID()}@example.test` },
      { id: secondUserId, email: `second-${crypto.randomUUID()}@example.test` },
    ]);
    const [benchmarkCase] = await client.db.insert(benchmarkCases).values({
      slug: `auth-${crypto.randomUUID()}`,
      title: "Auth identity benchmark",
      description: "Identity ownership fixture",
      category: "integration",
      difficulty: "easy",
      provider: "hosted-web",
    }).returning();
    assert.ok(benchmarkCase);

    const [run] = await client.db.insert(benchmarkRuns).values({
      caseId: benchmarkCase.id,
      guestId,
      status: "completed",
      score: 1,
      completedAt: new Date().toISOString(),
    }).returning();
    assert.ok(run);
    await client.db.insert(hostedWebSessions).values({
      runId: run.id,
      caseId: benchmarkCase.id,
      app: "shopping-lite",
      taskSlug: "auth-claim",
      seedVersion: "auth-v1",
      startUrl: "https://example.test/shop",
      sessionTokenHash: crypto.randomUUID(),
      createdByGuestId: guestId,
    });

    assert.equal(await repository.claimGuestOwnership({ userId: firstUserId, guestId }), 1);
    assert.equal(await repository.claimGuestOwnership({ userId: secondUserId, guestId }), 0);
    assert.equal((await client.db.select().from(profiles).where(eq(profiles.id, firstUserId))).length, 1);

    const [claimedRun] = await client.db.select().from(benchmarkRuns).where(eq(benchmarkRuns.id, run.id));
    assert.equal(claimedRun?.userId, firstUserId);
    assert.equal(claimedRun?.guestId, null);
    const [claimedSession] = await client.db.select().from(hostedWebSessions)
      .where(eq(hostedWebSessions.runId, run.id));
    assert.equal(claimedSession?.createdByUserId, firstUserId);
    assert.equal(claimedSession?.createdByGuestId, null);

    await client.db.insert(authSessions).values([
      { sessionToken: crypto.randomUUID(), userId: firstUserId, expires: new Date(Date.now() - 1_000) },
      { sessionToken: crypto.randomUUID(), userId: firstUserId, expires: new Date(Date.now() + 60_000) },
    ]);
    assert.equal(await repository.deleteExpiredSessions(), 1);

    assert.deepEqual(await repository.deleteIdentity(firstUserId), { anonymizedRuns: 1 });
    assert.equal((await client.db.select().from(authUsers).where(eq(authUsers.id, firstUserId))).length, 0);
    const [anonymousRun] = await client.db.select().from(benchmarkRuns).where(eq(benchmarkRuns.id, run.id));
    assert.equal(anonymousRun?.userId, null);
    assert.match(anonymousRun?.guestId ?? "", /^deleted-account:/);
    const [anonymousSession] = await client.db.select().from(hostedWebSessions)
      .where(eq(hostedWebSessions.runId, run.id));
    assert.equal(anonymousSession?.createdByUserId, null);
    assert.match(anonymousSession?.createdByGuestId ?? "", /^deleted-account:/);

    await client.db.delete(benchmarkRuns).where(eq(benchmarkRuns.id, run.id));
    await client.db.delete(benchmarkCases).where(eq(benchmarkCases.id, benchmarkCase.id));
    await client.db.delete(authUsers).where(eq(authUsers.id, secondUserId));
  } finally {
    await client.close();
  }
});
