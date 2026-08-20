import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  benchmarkAttempts,
  benchmarkCaseRevisions,
  benchmarkCases,
  benchmarkRuns,
  createDatabaseClient,
  hostedCallbackOutbox,
  hostedWebAccessLogs,
  hostedWebEvents,
  hostedWebResults,
  hostedWebSessions,
  orchestratorCommandDeadLetters,
  postgresErrorCode,
  resolveDatabaseUrl,
} from "../../src/index.js";
import { createHostedOrchestratorRepository } from "../../src/hosted-orchestrator/index.js";

test("hosted orchestrator read repository maps durable attempt state", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-hosted-orchestrator-integration",
    max: 1,
  });
  const repository = createHostedOrchestratorRepository(client.db);

  try {
    const [benchmarkCase] = await client.db.insert(benchmarkCases).values({
      slug: `orchestrator-${crypto.randomUUID()}`,
      title: "Orchestrator integration",
      description: "Durable read fixture",
      category: "integration",
      difficulty: "hard",
      provider: "hosted-web",
    }).returning();
    assert.ok(benchmarkCase);
    const [run] = await client.db.insert(benchmarkRuns).values({
      caseId: benchmarkCase.id,
      status: "running",
    }).returning();
    assert.ok(run);
    const [attempt] = await client.db.insert(benchmarkAttempts).values({
      runId: run.id,
      caseId: benchmarkCase.id,
      provider: "hosted-web",
      suiteSlug: "integration-suite",
      suiteVersion: "v1.0.0",
      status: "running",
      metadata: { activeSessionId: "first" },
    }).returning();
    assert.ok(attempt);
    const sessions = await client.db.insert(hostedWebSessions).values([
      {
        runId: run.id,
        caseId: benchmarkCase.id,
        attemptId: attempt.id,
        app: "shopping-lite",
        taskSlug: "checkout",
        sequenceIndex: 1,
        weight: 0.75,
        seedVersion: "v1",
        startUrl: "https://example.test/shopping?session=first",
        sessionTokenHash: crypto.randomUUID(),
        status: "completed",
        metadata: { title: "Checkout" },
      },
      {
        runId: run.id,
        caseId: benchmarkCase.id,
        attemptId: attempt.id,
        app: "notes-lite",
        taskSlug: "handoff",
        sequenceIndex: 2,
        weight: 0.25,
        seedVersion: "v1",
        startUrl: "https://example.test/notes?session=second",
        sessionTokenHash: crypto.randomUUID(),
        status: "active",
        metadata: { title: "Handoff" },
      },
    ]).returning();
    assert.equal(sessions.length, 2);
    await client.db.insert(hostedWebResults).values({
      sessionId: sessions[0]!.id,
      runId: run.id,
      attemptId: attempt.id,
      app: "shopping-lite",
      taskSlug: "checkout",
      status: "passed",
      score: 0.9,
      weight: 0.75,
      summary: "Passed checkout",
      finalState: { orderId: "redacted" },
      evaluators: [{ name: "backend_state", passed: true }],
    });

    assert.deepEqual(await repository.findAttemptMetadata(attempt.id), { activeSessionId: "first" });
    const ordered = await repository.listAttemptSessions(attempt.id);
    assert.deepEqual(ordered.map((row) => row.taskSlug), ["checkout", "handoff"]);
    assert.deepEqual(
      (await repository.listRunSessions(run.id)).map((row) => row.taskSlug),
      ["checkout", "handoff"],
    );
    assert.equal(ordered[0]?.weight, 0.75);
    assert.equal((await repository.findSessionById(sessions[0]!.id))?.taskSlug, "checkout");
    assert.equal(
      (await repository.findSessionByTokenHash(sessions[1]!.sessionTokenHash))?.id,
      sessions[1]!.id,
    );
    assert.equal(
      await repository.updateActiveSessionMetadata(sessions[0]!.sessionTokenHash, { ignored: true }),
      null,
    );
    assert.equal(
      await repository.updateActiveSessionMetadata(sessions[1]!.sessionTokenHash, { snapshot: 2 }),
      sessions[1]!.id,
    );
    assert.deepEqual((await repository.findSessionById(sessions[1]!.id))?.metadata, { snapshot: 2 });
    assert.equal(await repository.recordSessionAccess({
      session: sessions[1]!,
      accessCount: 3,
      accessedAt: new Date().toISOString(),
      firstSeenIp: "192.0.2.1",
      lastSeenIp: "192.0.2.2",
      firstSeenUserAgent: "integration-first",
      lastSeenUserAgent: "integration-last",
      event: "session.access",
      ip: "192.0.2.2",
      userAgent: "integration-last",
      referer: "https://example.test/",
    }), true);
    const accessedSession = await repository.findSessionById(sessions[1]!.id);
    assert.equal(accessedSession?.accessCount, 3);
    assert.equal(accessedSession?.lastSeenIp, "192.0.2.2");
    const accessRows = await client.db.select().from(hostedWebAccessLogs)
      .where(eq(hostedWebAccessLogs.sessionId, sessions[1]!.id));
    assert.equal(accessRows.length, 1);
    assert.deepEqual(accessRows[0]?.metadata, { app: "notes-lite", taskSlug: "handoff" });

    assert.ok(await repository.appendHostedEvent({
      sessionId: sessions[1]!.id,
      runId: run.id,
      attemptId: attempt.id,
      type: "hosted.action",
      name: "note.updated",
      payload: { field: "body" },
    }));
    const eventRows = await client.db.select().from(hostedWebEvents)
      .where(eq(hostedWebEvents.sessionId, sessions[1]!.id));
    assert.deepEqual(eventRows.map((row) => row.name), ["note.updated"]);

    await client.db.update(hostedWebSessions)
      .set({ expiresAt: "2020-06-01T00:00:00.000Z" })
      .where(eq(hostedWebSessions.id, sessions[1]!.id));
    const expiredSessions = await repository.listExpiredSessions("2021-01-01T00:00:00.000Z", 10);
    assert.deepEqual(expiredSessions.map((row) => row.id), [sessions[1]!.id]);
    await repository.appendExpiryDetectedLogs(expiredSessions);
    const expiryLogs = await client.db.select().from(hostedWebAccessLogs)
      .where(eq(hostedWebAccessLogs.event, "session.expiry_detected"));
    assert.equal(expiryLogs.length, 1);

    await client.db.insert(hostedWebAccessLogs).values({
      sessionId: sessions[1]!.id,
      runId: run.id,
      attemptId: attempt.id,
      event: "expired.fixture",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(
      await repository.pruneAccessLogsBefore("2021-01-01T00:00:00.000Z"),
      1,
    );
    const result = await repository.findLatestSessionResult(sessions[0]!.id);
    assert.equal(result?.score, 0.9);
    assert.equal(result?.status, "passed");
    assert.deepEqual(result?.evaluators, [{ name: "backend_state", passed: true }]);
    assert.equal(await repository.findLatestSessionResult(sessions[1]!.id), null);

    await client.db.delete(benchmarkRuns).where(eq(benchmarkRuns.id, run.id));
    await client.db.delete(benchmarkCases).where(eq(benchmarkCases.id, benchmarkCase.id));
  } finally {
    await client.close();
  }
});

test("hosted orchestrator initializes attempts and sessions atomically", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-hosted-initialization-integration",
    max: 1,
  });
  const repository = createHostedOrchestratorRepository(client.db);

  try {
    const [benchmarkCase] = await client.db.insert(benchmarkCases).values({
      slug: `initialization-${crypto.randomUUID()}`,
      title: "Initialization integration",
      description: "Transactional fixture",
      category: "integration",
      difficulty: "hard",
      provider: "hosted-web",
    }).returning();
    assert.ok(benchmarkCase);
    const [revision] = await client.db.insert(benchmarkCaseRevisions).values({
      caseId: benchmarkCase.id,
      revision: "v1.0.0",
      contentHash: crypto.randomUUID(),
      manifest: {},
    }).returning();
    assert.ok(revision);
    const runs = await client.db.insert(benchmarkRuns).values([
      { caseId: benchmarkCase.id, status: "running" },
      { caseId: benchmarkCase.id, status: "running" },
    ]).returning();
    assert.equal(runs.length, 2);

    const initialization = (runId: string, tokenHashes: string[]) => ({
      attempt: {
        runId,
        caseId: benchmarkCase.id,
        caseRevisionId: revision.id,
        provider: "hosted-web" as const,
        suiteSlug: "integration-suite",
        suiteVersion: "v1.0.0",
        status: "running" as const,
        metadata: { generationSeed: "seed" },
        startedAt: new Date().toISOString(),
      },
      sessions: tokenHashes.map((sessionTokenHash, sequenceIndex) => ({
        runId,
        caseId: benchmarkCase.id,
        provider: "hosted-web" as const,
        app: "notes-lite",
        taskSlug: `task-${sequenceIndex}`,
        taskVersion: "v1",
        sequenceIndex,
        weight: 1,
        required: true,
        seedVersion: "v1",
        startUrl: `https://example.test/notes?session=${sequenceIndex}`,
        sessionTokenHash,
        status: sequenceIndex === 0 ? "active" as const : "created" as const,
        metadata: { goal: `Goal ${sequenceIndex}` },
        activatedAt: new Date().toISOString(),
        expiresAt: sequenceIndex === 0 ? new Date(Date.now() + 60_000).toISOString() : null,
      })),
    });

    const created = await repository.createAttemptWithSessions(
      initialization(runs[0]!.id, [crypto.randomUUID(), crypto.randomUUID()]),
    );
    assert.equal(created.sessions.length, 2);
    assert.deepEqual(created.attempt.metadata, {
      generationSeed: "seed",
      activeSessionId: created.sessions[0]!.id,
      activeSequenceIndex: 0,
      completedSessionIds: [],
    });
    const transition = await repository.completeHostedAttemptSession({
      attemptId: created.attempt.id,
      sessionId: created.sessions[0]!.id,
      completedAt: "2026-08-17T12:00:00.000Z",
      result: { status: "passed", score: 1 },
      attemptUpdate: { complete: false },
    }) as Record<string, unknown>;
    assert.equal(transition.attemptId, created.attempt.id);
    assert.deepEqual(transition.result, { status: "passed", score: 1 });
    const timeout = await repository.timeoutHostedAttempt({
      attemptId: created.attempt.id,
      timeoutAt: "2026-08-17T12:01:00.000Z",
      timedOutSessionId: created.sessions[1]!.id,
      scoringSummary: { status: "timeout" },
    });
    assert.equal(timeout?.transitioned, true);
    assert.deepEqual(timeout?.expiredSessionIds, [created.sessions[1]!.id]);
    await client.db.insert(hostedCallbackOutbox).values({
      attemptId: created.attempt.id,
      runId: runs[0]!.id,
      payload: { status: "completed", score: 1, artifacts: [] },
      nextAttemptAt: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(await repository.reconcileCallbackOutbox(), 0);
    const claimedCallbacks = await repository.claimCallbackOutbox(20);
    assert.equal(claimedCallbacks.length, 1);
    assert.equal(claimedCallbacks[0]?.status, "delivering");
    assert.equal(claimedCallbacks[0]?.attempts, 1);
    await repository.markCallbackFailed({
      id: claimedCallbacks[0]!.id,
      status: "pending",
      nextAttemptAt: "2020-01-01T00:00:00.000Z",
      lastError: "retry fixture",
      updatedAt: "2026-08-17T12:02:00.000Z",
    });
    const [reclaimedCallback] = await repository.claimCallbackOutbox(20);
    assert.equal(reclaimedCallback?.attempts, 2);
    await repository.markCallbackDelivered(
      reclaimedCallback!.id,
      "2026-08-17T12:03:00.000Z",
    );
    const [deliveredCallback] = await client.db.select().from(hostedCallbackOutbox)
      .where(eq(hostedCallbackOutbox.id, reclaimedCallback!.id));
    assert.equal(deliveredCallback?.status, "delivered");
    assert.equal(deliveredCallback?.lastError, null);
    const deadLetterInput = {
      commandId: `command-${crypto.randomUUID()}`,
      stream: "agentbench:commands:0",
      messageId: "1-0",
      partition: 0,
      partitionKey: "attempt-1",
      payloadType: "attempt.timeout",
      payload: { attemptId: created.attempt.id },
      errorCode: "handler_failed",
      errorMessage: "redacted fixture",
      attempts: 1,
      status: "dead" as const,
      scrubbedAt: "2026-08-17T12:04:00.000Z",
      updatedAt: "2026-08-17T12:04:00.000Z",
    };
    await repository.upsertCommandDeadLetter(deadLetterInput);
    await repository.upsertCommandDeadLetter({ ...deadLetterInput, attempts: 2 });
    const deadLetters = await repository.listCommandDeadLetters({ limit: 10, status: "dead" });
    const persistedDeadLetter = deadLetters.find((row) => row.commandId === deadLetterInput.commandId);
    assert.equal(persistedDeadLetter?.attempts, 2);
    assert.equal(
      (await repository.findCommandDeadLetter(persistedDeadLetter!.id))?.payloadType,
      "attempt.timeout",
    );
    assert.equal(await repository.markCommandDeadLetterReplayed({
      id: persistedDeadLetter!.id,
      replayCommandId: "replay-1",
      replayedAt: "2026-08-17T12:05:00.000Z",
    }), true);
    assert.equal(await repository.markCommandDeadLetterReplayed({
      id: persistedDeadLetter!.id,
      replayCommandId: "replay-2",
      replayedAt: "2026-08-17T12:06:00.000Z",
    }), false);
    const [replayedDeadLetter] = await client.db.select().from(orchestratorCommandDeadLetters)
      .where(eq(orchestratorCommandDeadLetters.id, persistedDeadLetter!.id));
    assert.equal(replayedDeadLetter?.status, "replayed");
    assert.equal(await repository.pruneCommandDeadLetters({
      deadBefore: "2026-01-01T00:00:00.000Z",
      resolvedBefore: "2026-01-01T00:00:00.000Z",
      limit: 500,
      maxRows: 10_000,
    }), 2);
    assert.equal(await repository.scrubCommandDeadLetters(500), 3);
    assert.equal((await repository.findHostedAttempt(runs[0]!.id, benchmarkCase.id))?.id, created.attempt.id);
    await assert.rejects(
      repository.createAttemptWithSessions(
        initialization(runs[0]!.id, [crypto.randomUUID()]),
      ),
      (error: unknown) => postgresErrorCode(error) === "23505",
    );

    const duplicateToken = crypto.randomUUID();
    await assert.rejects(
      repository.createAttemptWithSessions(initialization(runs[1]!.id, [duplicateToken, duplicateToken])),
    );
    assert.equal(await repository.findHostedAttempt(runs[1]!.id, benchmarkCase.id), null);

    await client.db.delete(benchmarkRuns).where(eq(benchmarkRuns.id, runs[0]!.id));
    await client.db.delete(benchmarkRuns).where(eq(benchmarkRuns.id, runs[1]!.id));
    await client.db.delete(benchmarkCaseRevisions).where(eq(benchmarkCaseRevisions.id, revision.id));
    await client.db.delete(benchmarkCases).where(eq(benchmarkCases.id, benchmarkCase.id));
  } finally {
    await client.close();
  }
});
