import { hostedSuiteMetadataSchema } from "../src/schemas.js";
import { hostedWebCatalogReleases } from "../src/release.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

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
    throw new Error(
      `Catalog publication failed for ${release.revision} (${response.status}): ${await response.text()}`,
    );
  }

  console.log(`published ${release.revision} as ${await response.text()}`);
}
