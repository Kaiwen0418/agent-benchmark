#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-portable-postgres-$RANDOM"

cleanup() {
  status=$?
  if [[ "${status}" -ne 0 ]]; then
    echo "Portable PostgreSQL test failed; container logs follow." >&2
    docker logs "${CONTAINER}" >&2 || true
  fi
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  exit "${status}"
}
trap cleanup EXIT

docker run -d --rm --name "${CONTAINER}" \
  -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
if [[ "${postgres_ready:-false}" != "true" ]]; then
  echo "Portable PostgreSQL container did not become ready." >&2
  exit 1
fi

mapped_address="$(docker port "${CONTAINER}" 5432/tcp)"
mapped_port="${mapped_address##*:}"
export DATABASE_DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:${mapped_port}/postgres"

cd "${ROOT_DIR}"
echo "Applying portable migrations."
bash scripts/db-migrate.sh test
echo "Publishing the benchmark catalog."
pnpm catalog:publish
echo "Reapplying migrations to verify idempotency."
bash scripts/db-migrate.sh test

PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)

assert_query() {
  local description="$1"
  local expected="$2"
  local query="$3"
  local actual
  actual="$("${PSQL[@]}" -Atqc "${query}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "${description}: expected ${expected}, received ${actual}." >&2
    exit 1
  fi
}

assert_query "portable table count" "20" "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
assert_query "Auth.js table count" "4" "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('auth_users', 'auth_accounts', 'auth_sessions', 'auth_verification_tokens')"
assert_query "Auth.js ownership foreign key count" "5" "select count(*) from information_schema.table_constraints where constraint_schema = 'public' and constraint_type = 'FOREIGN KEY' and constraint_name in ('auth_accounts_user_id_auth_users_id_fk', 'auth_sessions_user_id_auth_users_id_fk', 'profiles_id_auth_users_id_fk', 'benchmark_runs_user_id_auth_users_id_fk', 'hosted_web_sessions_created_by_user_id_auth_users_id_fk')"
assert_query "published benchmark case count" "2" "select count(*) from public.benchmark_cases"
assert_query "published revision count" "2" "select count(*) from public.benchmark_case_revisions"
assert_query "row-level security table count" "0" "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity"
assert_query "Supabase compatibility role count" "0" "select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')"
assert_query "Supabase auth schema absence" "t" "select to_regnamespace('auth') is null"
assert_query "portable view count" "4" "select count(*) from information_schema.views where table_schema = 'public'"
assert_query "portable routine count" "12" "select count(*) from information_schema.routines where routine_schema = 'public'"

if "${PSQL[@]}" -v ON_ERROR_STOP=1 -c \
  "update public.benchmark_case_revisions set revision = 'mutated'" >/dev/null 2>&1; then
  echo "portable schema allowed mutation of an immutable benchmark revision" >&2
  exit 1
fi

echo "portable PostgreSQL migration tests passed"
