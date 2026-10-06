import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import {
  benchmarkCases,
  benchmarkRuns,
  createDatabaseClient,
  resolveDatabaseUrl,
} from "../../src/index.js";
import { createPublicResultReadRepository } from "../../src/public-results/index.js";

test("public result repository reads only publishable PostgreSQL projections", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-public-results-integration",
    max: 1,
  });
  const repository = createPublicResultReadRepository(client.db);

  try {
    const [benchmarkCase] = await client.db.insert(benchmarkCases).values({
      slug: `public-result-${crypto.randomUUID()}`,
      title: "Public result benchmark",
      description: "Public result repository fixture",
      category: "integration",
      difficulty: "hard",
      provider: "hosted-web",
      metadata: { suiteSlug: "integration-suite" },
      isPublic: true,
    }).returning();
    assert.ok(benchmarkCase);

    const [publicRun, privateRun, activeRun] = await client.db.insert(benchmarkRuns).values([
      {
        caseId: benchmarkCase.id,
        status: "completed",
        score: 0.9,
        isPublic: true,
        startedAt: "2026-08-17T09:00:00.000Z",
        completedAt: "2026-08-17T09:01:00.000Z",
      },
      { caseId: benchmarkCase.id, status: "completed", score: 1, isPublic: false },
      { caseId: benchmarkCase.id, status: "running", score: 0.5, isPublic: true },
    ]).returning();
    assert.ok(publicRun && privateRun && activeRun);

    await client.db.execute(sql`
      insert into public.public_hosted_run_summaries
        (run_id, case_id, benchmark_title, suite_slug, suite_version, observed_user_agent)
      values
        (${publicRun.id}, ${benchmarkCase.id}, ${benchmarkCase.title}, 'integration-suite', 'v1.2.3', 'Chrome/150')
    `);
    await client.db.execute(sql`
      insert into public.public_hosted_run_tasks
        (run_id, app, task_slug, status, score, summary, created_at)
      values
        (${publicRun.id}, 'shopping-lite', 'checkout', 'passed', 1, 'Passed', '2026-08-17T09:01:00.000Z')
    `);
    await client.db.execute(sql`
      insert into public.public_hosted_run_consistency_checks
        (run_id, sequence_index, name, source_task_slug, target_task_slug, status, score, required, failure_reason)
      values
        (${publicRun.id}, 1, 'Carry value', 'research', 'checkout', 'passed', 1, true, null)
    `);

    assert.equal((await repository.findRun(publicRun.id))?.id, publicRun.id);
    assert.equal(await repository.findRun(privateRun.id), null);
    assert.equal(await repository.findRun(activeRun.id), null);
    assert.equal((await repository.findCase(benchmarkCase.id))?.title, benchmarkCase.title);
    assert.equal((await repository.findSummary(publicRun.id))?.suiteVersion, "v1.2.3");
    assert.equal((await repository.listTasks(publicRun.id))[0]?.taskSlug, "checkout");
    assert.equal((await repository.listConsistencyChecks(publicRun.id))[0]?.sequenceIndex, 1);

    const publishedCases = await repository.listPublishedCases();
    assert.ok(publishedCases.some((item) => item.id === benchmarkCase.id));
    assert.deepEqual(await repository.listRunIdsBySuite(["v1.2.3"], "integration-suite"), [publicRun.id]);
    assert.equal((await repository.listLeaderboardRuns(null, 20)).some((item) => item.id === publicRun.id), true);
    assert.equal((await repository.listLeaderboardRuns([publicRun.id], 20))[0]?.id, publicRun.id);
    assert.equal((await repository.listSummaries([publicRun.id]))[0]?.observedUserAgent, "Chrome/150");

    await client.db.execute(sql`delete from public.public_hosted_run_consistency_checks where run_id = ${publicRun.id}`);
    await client.db.execute(sql`delete from public.public_hosted_run_tasks where run_id = ${publicRun.id}`);
    await client.db.execute(sql`delete from public.public_hosted_run_summaries where run_id = ${publicRun.id}`);
    await client.db.delete(benchmarkRuns).where(eq(benchmarkRuns.caseId, benchmarkCase.id));
    await client.db.delete(benchmarkCases).where(eq(benchmarkCases.id, benchmarkCase.id));
  } finally {
    await client.close();
  }
});
