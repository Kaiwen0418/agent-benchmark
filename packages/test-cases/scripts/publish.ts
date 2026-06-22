import { hostedSuiteMetadataSchema } from "../src/schemas.js";
import { createHostedWebCatalogRelease } from "../src/release.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const release = createHostedWebCatalogRelease();
hostedSuiteMetadataSchema.parse(release.manifest);

const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/publish_benchmark_case_revision`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    target_case_id: release.caseId,
    target_revision: release.revision,
    target_manifest: release.manifest,
    target_content_hash: release.contentHash,
  }),
});

if (!response.ok) {
  throw new Error(`Catalog publication failed (${response.status}): ${await response.text()}`);
}

console.log(`published ${release.revision} as ${await response.text()}`);
