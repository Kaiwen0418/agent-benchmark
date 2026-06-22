import { hostedWebSuiteCase, nativeBenchmarkCases } from "./index.js";

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function generateSupabaseSeedSql() {
  const nativeValues = nativeBenchmarkCases.map((item) => `  (
    '${item.id}',
    ${sqlString(item.slug)},
    ${sqlString(item.title)},
    ${sqlString(item.description)},
    ${sqlString(item.category)},
    ${sqlString(item.difficulty)},
    true
  )`).join(",\n");
  const metadata = JSON.stringify(hostedWebSuiteCase.metadata, null, 2);

  return `-- Generated from packages/test-cases. Run \`pnpm catalog:generate\`; do not edit by hand.
insert into public.benchmark_cases (id, slug, title, description, category, difficulty, is_public)
values
${nativeValues}
on conflict (id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  is_public = excluded.is_public;

insert into public.benchmark_cases (id, slug, title, description, category, difficulty, provider, metadata, is_public)
values (
  '${hostedWebSuiteCase.id}',
  ${sqlString(hostedWebSuiteCase.slug)},
  ${sqlString(hostedWebSuiteCase.title)},
  ${sqlString(hostedWebSuiteCase.description)},
  ${sqlString(hostedWebSuiteCase.category)},
  ${sqlString(hostedWebSuiteCase.difficulty)},
  '${hostedWebSuiteCase.provider}',
  $catalog$${metadata}$catalog$::jsonb,
  true
)
on conflict (id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  provider = excluded.provider,
  metadata = excluded.metadata,
  is_public = excluded.is_public;

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
