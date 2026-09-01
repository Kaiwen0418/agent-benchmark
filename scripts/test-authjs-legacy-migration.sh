#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-authjs-migration-$RANDOM"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm --name "${CONTAINER}" \
  -e POSTGRES_PASSWORD=postgres \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
if [[ "${postgres_ready:-false}" != "true" ]]; then
  echo "Auth.js migration PostgreSQL container did not become ready." >&2
  exit 1
fi

PSQL=(docker exec -i "${CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres)

"${PSQL[@]}" <<'SQL' >/dev/null
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create table public.profiles (id uuid primary key);
create table public.benchmark_runs (id uuid primary key, user_id uuid);
create table public.hosted_web_sessions (id uuid primary key, created_by_user_id uuid);

insert into auth.users values (
  '10000000-0000-4000-8000-000000000001',
  'Owner@Example.Test',
  '2026-08-01T12:00:00Z',
  '{"display_name":"Existing Owner","avatar_url":"https://example.test/avatar.png"}',
  '2026-07-01T12:00:00Z',
  '2026-08-01T12:00:00Z'
);
insert into public.profiles values ('10000000-0000-4000-8000-000000000002');
insert into public.benchmark_runs values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
);
insert into public.hosted_web_sessions values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
);
SQL

for _ in 1 2; do
  "${PSQL[@]}" < "${ROOT_DIR}/supabase/migrations/20260901000035_authjs_identity.sql" >/dev/null
done

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

assert_query "backfilled identity count" "4" \
  "select count(*) from public.auth_users"
assert_query "normalized Supabase identity" "owner@example.test|Existing Owner|https://example.test/avatar.png|true" \
  "select email || '|' || name || '|' || image || '|' || (email_verified is not null)::text from public.auth_users where id = '10000000-0000-4000-8000-000000000001'"
assert_query "placeholder identity count" "3" \
  "select count(*) from public.auth_users where email is null"
assert_query "identity ownership foreign key count" "3" \
  "select count(*) from pg_constraint where conname in ('profiles_id_auth_users_id_fk', 'benchmark_runs_user_id_auth_users_id_fk', 'hosted_web_sessions_created_by_user_id_auth_users_id_fk')"

echo "Auth.js legacy identity migration tests passed"
