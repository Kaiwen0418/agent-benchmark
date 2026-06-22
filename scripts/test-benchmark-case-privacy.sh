#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-case-privacy-postgres-$RANDOM"
PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm --name "${CONTAINER}" \
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
  id uuid primary key,
  slug text not null,
  title text not null,
  description text not null,
  category text not null,
  difficulty text not null,
  provider text,
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.benchmark_cases enable row level security;
create policy "benchmark_cases_public_read"
  on public.benchmark_cases for select to anon, authenticated using (is_public = true);
grant select on public.benchmark_cases to anon, authenticated, service_role;

insert into public.benchmark_cases (
  id, slug, title, description, category, difficulty, provider, metadata, is_public
) values (
  '70000000-0000-0000-0000-000000000001',
  'hosted-web-suite',
  'Hosted Web Suite',
  'Public description',
  'browser',
  'easy',
  'hosted-web',
  '{
    "suiteSlug":"hosted-web-suite-v1",
    "suiteVersion":"v2",
    "sessions":[{
      "app":"wiki-lite",
      "taskSlug":"wiki-release-answer",
      "title":"Wiki Release Lookup",
      "taskVersion":"v2",
      "sequenceIndex":0,
      "weight":1,
      "required":true,
      "metadata":{"questionVariants":[{"goal":"Find the date","taskConfig":{"canonicalValue":"June 1, 2026"}}]}
    }]
  }'::jsonb,
  true
);
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260622000019_protect_benchmark_case_manifests.sql" >/dev/null

for role in anon authenticated; do
  if "${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "set role ${role}; select metadata from public.benchmark_cases;" >/dev/null 2>&1; then
    echo "${role} can still read private benchmark case metadata" >&2
    exit 1
  fi

  public_case="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "set role ${role}; select row_to_json(cases) from public.public_benchmark_cases cases;")"
  [[ "${public_case}" == *'"suiteVersion":"v2"'* ]]
  [[ "${public_case}" == *'"app":"wiki-lite"'* ]]
  [[ "${public_case}" != *'taskConfig'* ]]
  [[ "${public_case}" != *'canonicalValue'* ]]
  [[ "${public_case}" != *'June 1, 2026'* ]]
done

private_metadata="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "set role service_role; select metadata from public.benchmark_cases;")"
[[ "${private_metadata}" == *'taskConfig'* ]]
[[ "${private_metadata}" == *'June 1, 2026'* ]]

echo "benchmark case privacy tests passed"
