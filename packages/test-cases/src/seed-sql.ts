import { hostedWebCatalogReleases } from "./release.js";

export function generateSupabaseSeedSql() {
  const catalogStatements = hostedWebCatalogReleases()
    .map((release) =>
      [
        "select public.publish_benchmark_case_catalog(",
        `  $case$${JSON.stringify(release.benchmarkCase, null, 2)}$case$::jsonb,`,
        `  '${release.revision}',`,
        `  $catalog$${JSON.stringify(release.manifest, null, 2)}$catalog$::jsonb,`,
        `  '${release.contentHash}'`,
        ");",
      ].join("\n"),
    )
    .join("\n\n");

  return `-- Generated from packages/test-cases. Run \`pnpm catalog:generate\`; do not edit by hand.
${catalogStatements}
`;
}
