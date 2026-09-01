import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  artifacts,
  authUsers,
  benchmarkCases,
  benchmarkRuns,
  createDatabaseClient,
  profiles,
  resolveDatabaseUrl,
  runEvents,
} from "../../src/index.js";
import { createWebControlPlaneRepository } from "../../src/web-control-plane/index.js";

const completableStatuses = [
  "queued",
  "waiting_for_agent",
  "agent_connected",
  "starting",
  "running",
  "scoring",
] as const;

const terminalStatuses = ["completed", "failed", "cancelled", "timeout"] as const;

test("web control-plane repository persists run lifecycle atomically", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-web-control-plane-integration",
    max: 1,
  });
  const repository = createWebControlPlaneRepository(client.db);

  try {
    const [benchmarkCase] = await client.db.insert(benchmarkCases).values({
      slug: `integration-${crypto.randomUUID()}`,
      title: "Integration benchmark",
      description: "Repository integration fixture",
      category: "integration",
      difficulty: "easy",
      provider: "hosted-web",
    }).returning();
    assert.ok(benchmarkCase);

    const run = await repository.createRun({
      caseId: benchmarkCase.id,
      guestId: "integration-guest",
      executionMode: "external-agent",
      status: "waiting_for_agent",
      browserEnvironment: { browser: "Chrome" },
      metadata: { source: "integration" },
    }, { status: "waiting_for_agent" });

    const createdEvents = await repository.listEvents(run.id);
    assert.equal(createdEvents.length, 1);
    assert.equal(createdEvents[0]?.type, "run.created");

    const connected = await repository.updateRunMetadata({
      runId: run.id,
      update: {
        status: "agent_connected",
        agentName: "Integration Agent",
        startedAt: "2026-08-17T10:00:00.000Z",
      },
      connectedEvent: { agentName: "Integration Agent" },
      terminalStatuses: [...terminalStatuses],
    });
    assert.equal(connected?.status, "agent_connected");
    assert.equal(connected?.agentName, "Integration Agent");

    const appended = await repository.appendEvent({
      runId: run.id,
      type: "run.running",
      payload: { liveViewUrl: "https://example.test/live" },
      transition: {
        status: "running",
        liveViewUrl: "https://example.test/live",
      },
    });
    assert.equal(appended.run?.status, "running");

    const completed = await repository.completeRun({
      runId: run.id,
      status: "completed",
      score: 1,
      errorMessage: null,
      completedAt: "2026-08-17T10:01:00.000Z",
      artifacts: [{ type: "trace", storagePath: "runs/integration/trace.json", url: null }],
      completableStatuses: [...completableStatuses],
    });
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.score, 1);

    const repeated = await repository.completeRun({
      runId: run.id,
      status: "failed",
      score: 0,
      errorMessage: "late duplicate",
      completedAt: "2026-08-17T10:02:00.000Z",
      artifacts: [{ type: "trace", storagePath: "runs/integration/duplicate.json", url: null }],
      completableStatuses: [...completableStatuses],
    });
    assert.equal(repeated?.status, "completed");
    assert.equal((await repository.listArtifacts(run.id)).length, 1);
    assert.equal(
      (await repository.listEvents(run.id)).filter((event) => event.type === "run.completed").length,
      1,
    );
    assert.equal(await repository.updateRunMetadata({
      runId: run.id,
      update: { agentName: "Too Late" },
      connectedEvent: null,
      terminalStatuses: [...terminalStatuses],
    }), null);

    const fingerprint = await repository.streamFingerprint(run.id);
    assert.equal(fingerprint.run?.status, "completed");
    assert.ok(fingerprint.lastEventId);
    assert.ok(fingerprint.lastArtifactId);

    const userId = crypto.randomUUID();
    await client.db.insert(authUsers).values({ id: userId });
    await client.db.insert(profiles).values({ id: userId, dailyRunLimit: 7 });
    await client.db.insert(benchmarkRuns).values({
      caseId: benchmarkCase.id,
      userId,
      guestId: "integration-guest",
      createdAt: "2026-08-17T11:00:00.000Z",
    });
    assert.equal(await repository.findUserDailyLimit(userId), 7);
    assert.equal(await repository.countRunsSince({ userId }, "2026-08-17T00:00:00.000Z"), 1);
    assert.equal(await repository.countRunsSince({ guestId: "integration-guest" }, "2026-08-17T00:00:00.000Z"), 2);

    await client.db.delete(runEvents).where(eq(runEvents.runId, run.id));
    await client.db.delete(artifacts).where(eq(artifacts.runId, run.id));
    await client.db.delete(benchmarkRuns).where(eq(benchmarkRuns.caseId, benchmarkCase.id));
    await client.db.delete(authUsers).where(eq(authUsers.id, userId));
    await client.db.delete(benchmarkCases).where(eq(benchmarkCases.id, benchmarkCase.id));
  } finally {
    await client.close();
  }
});
