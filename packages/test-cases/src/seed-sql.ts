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

insert into public.runners (id, name, status, capacity, current_load, last_heartbeat)
values (
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f1001',
  'mock-runner-eu-1',
  'online',
  2,
  0,
  now()
)
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  capacity = excluded.capacity,
  current_load = excluded.current_load,
  last_heartbeat = excluded.last_heartbeat;
`;
}
