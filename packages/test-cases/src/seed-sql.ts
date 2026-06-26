import { hostedWebHardSuiteCase, hostedWebSuiteCase } from "./index.js";
import { createHostedWebCatalogRelease, createHostedWebHardCatalogRelease } from "./release.js";

export function generateSupabaseSeedSql() {
  const easyRelease = createHostedWebCatalogRelease();
  const easyManifest = JSON.stringify(easyRelease.manifest, null, 2);
  const hardRelease = createHostedWebHardCatalogRelease();
  const hardManifest = JSON.stringify(hardRelease.manifest, null, 2);

  return `-- Generated from packages/test-cases. Run \`pnpm catalog:generate\`; do not edit by hand.
select public.publish_benchmark_case_catalog(
  $case$${JSON.stringify(hostedWebSuiteCase, null, 2)}$case$::jsonb,
  '${easyRelease.revision}',
  $catalog$${easyManifest}$catalog$::jsonb,
  '${easyRelease.contentHash}'
);

select public.publish_benchmark_case_catalog(
  $case$${JSON.stringify(hostedWebHardSuiteCase, null, 2)}$case$::jsonb,
  '${hardRelease.revision}',
  $catalog$${hardManifest}$catalog$::jsonb,
  '${hardRelease.contentHash}'
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
