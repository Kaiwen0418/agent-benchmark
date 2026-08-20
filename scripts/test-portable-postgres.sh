#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-portable-postgres-$RANDOM"

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

mapped_address="$(docker port "${CONTAINER}" 5432/tcp)"
mapped_port="${mapped_address##*:}"
export DATABASE_DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:${mapped_port}/postgres"

cd "${ROOT_DIR}"
bash scripts/db-migrate.sh test >/dev/null
pnpm catalog:publish >/dev/null
bash scripts/db-migrate.sh test >/dev/null

PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.tables where table_schema = 'public'")" == "16" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.benchmark_cases")" == "2" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.benchmark_case_revisions")" == "2" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity")" == "0" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')")" == "0" ]]
[[ "$("${PSQL[@]}" -Atqc "select to_regnamespace('auth') is null")" == "t" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.views where table_schema = 'public'")" == "4" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from information_schema.routines where routine_schema = 'public'")" == "12" ]]

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c \
  "update public.benchmark_case_revisions set revision = 'mutated'" >/dev/null 2>&1; then
  echo "portable schema allowed mutation of an immutable benchmark revision" >&2
  exit 1
fi

echo "portable PostgreSQL migration tests passed"
