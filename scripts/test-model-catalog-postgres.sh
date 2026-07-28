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

create table public.benchmark_runs (
  id uuid primary key default gen_random_uuid()
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

echo "model catalog postgres tests passed"
