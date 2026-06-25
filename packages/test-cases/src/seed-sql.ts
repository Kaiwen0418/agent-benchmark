import { hostedWebSuiteCase } from "./index.js";
import { createHostedWebCatalogRelease } from "./release.js";

export function generateSupabaseSeedSql() {
  const release = createHostedWebCatalogRelease();
  const manifest = JSON.stringify(release.manifest, null, 2);

  return `-- Generated from packages/test-cases. Run \`pnpm catalog:generate\`; do not edit by hand.
select public.publish_benchmark_case_catalog(
  $case$${JSON.stringify(hostedWebSuiteCase, null, 2)}$case$::jsonb,
  '${release.revision}',
  $catalog$${manifest}$catalog$::jsonb,
  '${release.contentHash}'
);

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
