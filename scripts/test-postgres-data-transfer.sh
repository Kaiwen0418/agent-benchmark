#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-transfer-postgres-$RANDOM"

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

docker exec "${CONTAINER}" createdb -U postgres source_database
docker exec "${CONTAINER}" createdb -U postgres target_database
docker exec "${CONTAINER}" createdb -U postgres active_run_target
mapped_address="$(docker port "${CONTAINER}" 5432/tcp)"
mapped_port="${mapped_address##*:}"
source_url="postgresql://postgres:postgres@127.0.0.1:${mapped_port}/source_database"
target_url="postgresql://postgres:postgres@127.0.0.1:${mapped_port}/target_database"
active_target_url="postgresql://postgres:postgres@127.0.0.1:${mapped_port}/active_run_target"
transfer_source_url="postgresql://postgres:postgres@127.0.0.1:5432/source_database"
transfer_target_url="postgresql://postgres:postgres@127.0.0.1:5432/target_database"
transfer_active_target_url="postgresql://postgres:postgres@127.0.0.1:5432/active_run_target"
database_executor="${ROOT_DIR}/scripts/lib/exec-postgres-url.py"

cd "${ROOT_DIR}"
DATABASE_DIRECT_URL="${source_url}" bash scripts/db-migrate.sh test >/dev/null
DATABASE_DIRECT_URL="${target_url}" bash scripts/db-migrate.sh test >/dev/null
DATABASE_DIRECT_URL="${active_target_url}" bash scripts/db-migrate.sh test >/dev/null
DATABASE_DIRECT_URL="${source_url}" pnpm catalog:publish >/dev/null

DATABASE_COMMAND_URL="${source_url}" "${database_executor}" \
  psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.auth_users (id, name, email, email_verified)
values (
  '00000000-0000-0000-0000-000000000010',
  'Transfer User',
  'transfer@example.test',
  now()
);

insert into public.profiles (id, daily_run_limit)
values ('00000000-0000-0000-0000-000000000010', 7);

insert into public.benchmark_runs (id, guest_id, case_id, status, score, completed_at)
select '00000000-0000-0000-0000-000000000001', 'transfer-test', id, 'completed', 1, now()
from public.benchmark_cases
order by slug
limit 1;

insert into public.benchmark_runs (id, user_id, case_id, status, score, completed_at)
select
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000010',
  id,
  'completed',
  1,
  now()
from public.benchmark_cases
order by slug
limit 1;

insert into public.run_events (run_id, type, payload)
values ('00000000-0000-0000-0000-000000000001', 'transfer_test', '{"ok":true}');
SQL

POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
SOURCE_DATABASE_URL="${transfer_source_url}" TARGET_DATABASE_URL="${transfer_target_url}" \
  bash scripts/db-transfer-data.sh >/dev/null

[[ "$(docker exec "${CONTAINER}" psql -U postgres -d target_database -X -Atqc "select count(*) from public.benchmark_runs")" == "2" ]]
[[ "$(docker exec "${CONTAINER}" psql -U postgres -d target_database -X -Atqc "select count(*) from public.run_events")" == "1" ]]
[[ "$(docker exec "${CONTAINER}" psql -U postgres -d target_database -X -Atqc "select count(*) from public.benchmark_case_revisions")" == "2" ]]
[[ "$(docker exec "${CONTAINER}" psql -U postgres -d target_database -X -Atqc "select email from public.auth_users")" == "transfer@example.test" ]]
[[ "$(docker exec "${CONTAINER}" psql -U postgres -d target_database -X -Atqc "select daily_run_limit from public.profiles")" == "7" ]]

if POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="${transfer_source_url}" TARGET_DATABASE_URL="${transfer_target_url}" \
  bash scripts/db-transfer-data.sh >/dev/null 2>&1; then
  echo "data transfer accepted a non-empty target" >&2
  exit 1
fi

DATABASE_COMMAND_URL="${source_url}" "${database_executor}" \
  psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.benchmark_runs (id, guest_id, case_id, status)
select '00000000-0000-0000-0000-000000000002', 'active-transfer-test', id, 'running'
from public.benchmark_cases
order by slug
limit 1;
SQL

if POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="${transfer_source_url}" TARGET_DATABASE_URL="${transfer_active_target_url}" \
  bash scripts/db-transfer-data.sh >/dev/null 2>&1; then
  echo "data transfer accepted a source with an active run" >&2
  exit 1
fi

echo "PostgreSQL data transfer tests passed"
