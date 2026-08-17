#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-model-catalog-postgres-$RANDOM"
PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm --name "${CONTAINER}" \
  -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
"${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc 'select 1' >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon;
create role authenticated;
create role service_role bypassrls;

create table public.benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  category text not null,
  difficulty text not null,
  provider text default 'native',
  current_revision_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.benchmark_case_revisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.benchmark_cases(id) on delete restrict,
  revision text not null,
  content_hash text not null,
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique (case_id, id),
  unique (case_id, revision),
  unique (case_id, content_hash)
);

create table public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  guest_id text,
  case_id uuid not null references public.benchmark_cases(id) on delete restrict,
  runner_id uuid,
  execution_mode text not null default 'internal',
  status text not null default 'queued',
  score numeric,
  live_view_url text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  agent_name text,
  agent_version text,
  base_model text,
  browser_environment jsonb not null default '{}'::jsonb,
  is_public boolean not null default true
);

create table public.profiles (
  id uuid primary key,
  daily_run_limit integer default 3
);

create table public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.benchmark_runs(id) on delete cascade,
  type text not null,
  storage_path text,
  url text,
  created_at timestamptz not null default now()
);

-- The production objects are security-barrier views. Tables with the same
-- projected columns keep this repository test independent from orchestrator
-- fixture setup while exercising PostgreSQL/Drizzle type mapping.
create table public.public_hosted_run_summaries (
  run_id uuid,
  case_id uuid,
  benchmark_title text,
  suite_slug text,
  suite_version text,
  observed_user_agent text
);

create table public.public_hosted_run_tasks (
  run_id uuid,
  app text,
  task_slug text,
  status text,
  score numeric,
  summary text,
  created_at timestamptz
);

create table public.public_hosted_run_consistency_checks (
  run_id uuid,
  sequence_index bigint,
  name text,
  source_task_slug text,
  target_task_slug text,
  status text,
  score numeric,
  required boolean,
  failure_reason text
);
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260723000033_model_catalog.sql" >/dev/null

seed_valid="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "
  select count(*) = 4
    and bool_or(model_id = 'gpt-5.6-sol' and 'medium' = any(reasoning_efforts))
    and bool_or(model_id = 'gpt-4o' and status = 'legacy')
  from public.model_catalog;
")"
[[ "${seed_valid}" == "t" ]]

run_columns_valid="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "
  select count(*) = 4
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'benchmark_runs'
    and column_name in (
      'model_provider',
      'model_id',
      'reasoning_effort',
      'model_catalog_verified_at'
    );
")"
[[ "${run_columns_valid}" == "t" ]]

for role in anon authenticated; do
  if "${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc \
    "set role ${role}; select * from public.model_catalog;" >/dev/null 2>&1; then
    echo "${role} can read the service-only model catalog directly" >&2
    exit 1
  fi
done

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "
  insert into public.model_catalog (provider, model_id, display_name, status)
  values ('test', 'invalid', 'Invalid', 'unknown');
" >/dev/null 2>&1; then
  echo "model catalog accepted an invalid lifecycle status" >&2
  exit 1
fi

POSTGRES_PORT="$(docker port "${CONTAINER}" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/postgres" \
  pnpm --filter @agentbench/database test:integration

echo "model catalog postgres tests passed"
