import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  benchmarkCaseRevisions,
  benchmarkCases,
  createDatabaseClient,
  resolveDatabaseUrl,
} from "../../src/index.js";
import { createBenchmarkCaseReadRepository } from "../../src/benchmark-cases/index.js";

const caseId = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";

test("benchmark case repository preserves public and private read boundaries", async () => {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(),
    applicationName: "agentbench-benchmark-case-integration",
    max: 1,
  });
  const repository = createBenchmarkCaseReadRepository(client.db);

  try {
    await client.db.insert(benchmarkCases).values({
      id: caseId,
      slug: "integration-hosted-suite",
      title: "Integration Hosted Suite",
      description: "Repository integration fixture.",
      category: "browser",
      difficulty: "hard",
      provider: "hosted-web",
      metadata: { display: true },
      isPublic: true,
    });
    await client.db.insert(benchmarkCaseRevisions).values({
      id: revisionId,
      caseId,
      revision: "v1.0.0",
      contentHash: "a".repeat(64),
      manifest: {
        suiteSlug: "integration-hosted-suite",
        suiteVersion: "v1.0.0",
        privateAnswer: "must-not-enter-public-projection",
      },
    });
    await client.db
      .update(benchmarkCases)
      .set({ currentRevisionId: revisionId })
      .where(eq(benchmarkCases.id, caseId));

    assert.equal((await repository.findByIdOrSlug(caseId))?.slug, "integration-hosted-suite");
    assert.equal((await repository.findByIdOrSlug("integration-hosted-suite"))?.id, caseId);
    assert.equal(await repository.revisionExists(caseId, revisionId), true);
    assert.equal(await repository.revisionExists(caseId, "20000000-0000-4000-8000-000000000002"), false);
    const revision = await repository.findRevisionById(revisionId);
    assert.equal(revision?.caseId, caseId);
    assert.equal(revision?.contentHash, "a".repeat(64));
    assert.equal(await repository.findRevisionById("20000000-0000-4000-8000-000000000002"), null);

    const publicRows = await repository.listPublicHosted();
    const publicRow = publicRows.find((row) => row.id === caseId);
    assert.equal(publicRow?.title, "Integration Hosted Suite");
    assert.equal("manifest" in (publicRow ?? {}), false);
    assert.equal("metadata" in (publicRow ?? {}), false);

    const revisions = await repository.listCalibrationRevisions([caseId]);
    assert.equal(revisions[0]?.id, revisionId);
    assert.deepEqual(revisions[0]?.manifest, {
      suiteSlug: "integration-hosted-suite",
      suiteVersion: "v1.0.0",
      privateAnswer: "must-not-enter-public-projection",
    });
  } finally {
    await client.db
      .update(benchmarkCases)
      .set({ currentRevisionId: null })
      .where(eq(benchmarkCases.id, caseId));
    await client.db.delete(benchmarkCaseRevisions).where(eq(benchmarkCaseRevisions.caseId, caseId));
    await client.db.delete(benchmarkCases).where(eq(benchmarkCases.id, caseId));
    await client.close();
  }
});
