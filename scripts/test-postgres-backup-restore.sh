#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-backup-postgres-$RANDOM"
BACKUP_FILE="$(mktemp -t agentbench-postgres-backup.XXXXXX)"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  rm -f "${BACKUP_FILE}"
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

mapped_address="$(docker port "${CONTAINER}" 5432/tcp)"
mapped_port="${mapped_address##*:}"
export DATABASE_DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:${mapped_port}/postgres"

cd "${ROOT_DIR}"
bash scripts/db-migrate.sh test >/dev/null
pnpm catalog:publish >/dev/null
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.auth_users (id, email, email_verified)
values (
  '10000000-0000-4000-8000-000000000001',
  'backup@example.test',
  now()
);
insert into public.profiles (id, daily_run_limit)
values ('10000000-0000-4000-8000-000000000001', 9);
SQL

docker exec "${CONTAINER}" pg_dump -U postgres -d postgres \
  --format=custom --no-owner --no-acl >"${BACKUP_FILE}"
docker exec "${CONTAINER}" createdb -U postgres restored
docker exec -i "${CONTAINER}" pg_restore -U postgres -d restored \
  --no-owner --no-acl <"${BACKUP_FILE}"

PSQL=(docker exec -i "${CONTAINER}" psql -U postgres -d restored)
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")" == "20" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('auth_users', 'auth_accounts', 'auth_sessions', 'auth_verification_tokens')")" == "4" ]]
[[ "$("${PSQL[@]}" -Atqc "select email from public.auth_users where id = '10000000-0000-4000-8000-000000000001'")" == "backup@example.test" ]]
[[ "$("${PSQL[@]}" -Atqc "select daily_run_limit from public.profiles where id = '10000000-0000-4000-8000-000000000001'")" == "9" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.benchmark_cases")" == "2" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.benchmark_case_revisions")" == "2" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.routines where routine_schema = 'public'")" == "12" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.views where table_schema = 'public'")" == "4" ]]

echo "PostgreSQL backup and restore tests passed"
