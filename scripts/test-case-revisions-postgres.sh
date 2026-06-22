#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-case-revisions-postgres-$RANDOM"
PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm --name "${CONTAINER}" -e POSTGRES_PASSWORD=postgres postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "${CONTAINER}" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done

"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create extension if not exists pgcrypto;
create role anon;
create role authenticated;
create role service_role bypassrls;

create table public.benchmark_cases (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  description text not null,
  category text not null,
  difficulty text not null,
  provider text,
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.benchmark_runs (
  id uuid primary key,
  case_id uuid not null references public.benchmark_cases(id) on delete restrict
);
create table public.benchmark_attempts (
  id uuid primary key,
  run_id uuid not null references public.benchmark_runs(id),
  case_id uuid not null references public.benchmark_cases(id),
  provider text not null
);

insert into public.benchmark_cases(id, slug, title, description, category, difficulty, provider, metadata) values
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005', 'shopping-constrained-checkout',
    'Hosted Web Suite', 'Hosted suite', 'browser', 'easy', 'hosted-web',
    '{"suiteSlug":"hosted-suite","suiteVersion":"v1","sessions":[]}'::jsonb
  ),
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001', 'web-search',
    'Web Search', 'Legacy referenced case', 'browser', 'easy', 'native', '{}'::jsonb
  ),
  (
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002', 'invoice-download',
    'Invoice Download', 'Legacy unreferenced case', 'browser', 'easy', 'native', '{}'::jsonb
  );
insert into public.benchmark_runs values
  ('71000000-0000-0000-0000-000000000001', '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'),
  ('71000000-0000-0000-0000-000000000002', '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001');
insert into public.benchmark_attempts values (
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
  'hosted-web'
);
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260622000020_immutable_benchmark_case_revisions.sql" >/dev/null

initial_revision="$(${PSQL[@]} -Atqc "select current_revision_id from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'")"
attempt_revision="$(${PSQL[@]} -Atqc "select case_revision_id from public.benchmark_attempts")"
[[ -n "${initial_revision}" && "${initial_revision}" == "${attempt_revision}" ]]

published_revision="$(${PSQL[@]} -Atqc "
  set role service_role;
  select public.publish_benchmark_case_revision(
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
    'v2',
    '{\"suiteSlug\":\"hosted-suite\",\"suiteVersion\":\"v2\",\"sessions\":[]}'::jsonb,
    repeat('b', 64)
  );
")"
duplicate_revision="$(${PSQL[@]} -Atqc "
  set role service_role;
  select public.publish_benchmark_case_revision(
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
    'v2',
    '{\"suiteSlug\":\"hosted-suite\",\"suiteVersion\":\"v2\",\"sessions\":[]}'::jsonb,
    repeat('b', 64)
  );
")"
[[ "${published_revision}" == "${duplicate_revision}" && "${published_revision}" != "${initial_revision}" ]]

content_duplicate_revision="$(${PSQL[@]} -Atqc "
  set role service_role;
  select public.publish_benchmark_case_revision(
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
    'v2-alias',
    '{\"suiteSlug\":\"hosted-suite\",\"suiteVersion\":\"v2\",\"sessions\":[]}'::jsonb,
    repeat('b', 64)
  );
")"
[[ "${content_duplicate_revision}" == "${published_revision}" ]]

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "
  set role service_role;
  select public.publish_benchmark_case_revision(
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
    'v2',
    '{\"suiteSlug\":\"hosted-suite\",\"suiteVersion\":\"changed\",\"sessions\":[]}'::jsonb,
    repeat('c', 64)
  );
" >/dev/null 2>&1; then
  echo "revision identity accepted different content" >&2
  exit 1
fi

historical_revision="$(${PSQL[@]} -Atqc "select case_revision_id from public.benchmark_attempts where id = '72000000-0000-0000-0000-000000000001'")"
current_revision="$(${PSQL[@]} -Atqc "select current_revision_id from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'")"
[[ "${historical_revision}" == "${initial_revision}" && "${current_revision}" == "${published_revision}" ]]

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "update public.benchmark_case_revisions set revision = 'mutated' where id = '${initial_revision}'" >/dev/null 2>&1; then
  echo "immutable revision accepted an update" >&2
  exit 1
fi
if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "delete from public.benchmark_case_revisions where id = '${initial_revision}'" >/dev/null 2>&1; then
  echo "immutable revision accepted a delete" >&2
  exit 1
fi
if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "insert into public.benchmark_attempts(id, run_id, case_id, provider) values ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'hosted-web')" >/dev/null 2>&1; then
  echo "hosted attempt without a revision passed validation" >&2
  exit 1
fi
if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c "set role anon; select * from public.benchmark_case_revisions" >/dev/null 2>&1; then
  echo "anonymous role can read private revisions" >&2
  exit 1
fi

"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260622000021_unify_benchmark_case_model.sql" >/dev/null

[[ "$(${PSQL[@]} -Atqc "select slug from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'")" == "hosted-web-suite" ]]
[[ "$(${PSQL[@]} -Atqc "select metadata from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'")" == "{}" ]]
[[ "$(${PSQL[@]} -Atqc "select count(*) from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002'")" == "0" ]]
[[ "$(${PSQL[@]} -Atqc "select is_public from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001'")" == "f" ]]
[[ "$(${PSQL[@]} -Atqc "select metadata ->> 'suiteVersion' from public.public_benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'")" == "v2" ]]

post_migration_revision="$(${PSQL[@]} -Atqc "
  set role service_role;
  select public.publish_benchmark_case_revision(
    '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005',
    'v2',
    '{\"suiteSlug\":\"hosted-suite\",\"suiteVersion\":\"v2\",\"sessions\":[]}'::jsonb,
    repeat('b', 64)
  );
")"
[[ "${post_migration_revision}" == "${published_revision}" ]]
[[ "$(${PSQL[@]} -Atqc "select metadata from public.benchmark_cases where id = '7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005'")" == "{}" ]]

echo "benchmark case revision Postgres tests passed"
