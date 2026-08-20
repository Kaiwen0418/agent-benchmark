import {
  createDatabaseClient,
  resolveDatabaseUrl,
} from "@agentbench/database";
import { createBenchmarkCaseCatalogRepository } from "@agentbench/database/benchmark-cases";
import { hostedSuiteMetadataSchema } from "../src/schemas.js";
import { hostedWebCatalogReleases } from "../src/release.js";

const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (databaseUrl) {
  const client = createDatabaseClient({
    connectionString: resolveDatabaseUrl(process.env, { preferDirect: true }),
    applicationName: "agentbench-catalog-publish",
    max: 1,
  });
  const repository = createBenchmarkCaseCatalogRepository(client.db);

  try {
    for (const release of hostedWebCatalogReleases()) {
      hostedSuiteMetadataSchema.parse(release.manifest);
      const revisionId = await repository.publish({
        benchmarkCase: release.benchmarkCase,
        revision: release.revision,
        manifest: release.manifest,
        contentHash: release.contentHash,
      });
      console.log(`published ${release.revision} as ${revisionId}`);
    }
  } finally {
    await client.close();
  }
} else if (supabaseUrl && serviceRoleKey) {
  const rpcUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/publish_benchmark_case_catalog`;
  for (const release of hostedWebCatalogReleases()) {
    hostedSuiteMetadataSchema.parse(release.manifest);
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_case: release.benchmarkCase,
        target_revision: release.revision,
        target_manifest: release.manifest,
        target_content_hash: release.contentHash,
      }),
    });
    if (!response.ok) {
      throw new Error(`Catalog publication failed for ${release.revision} (${response.status}).`);
    }
    console.log(`published ${release.revision} through the compatibility endpoint`);
  }
} else {
  throw new Error("DATABASE_DIRECT_URL or legacy Supabase publication credentials are required.");
}
