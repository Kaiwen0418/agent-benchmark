#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-hosted-read-models-postgres-$RANDOM"
PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)
trap 'docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true' EXIT

docker run -d --rm --name "${CONTAINER}" -e POSTGRES_PASSWORD=postgres postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "${CONTAINER}" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done

"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon;
create role authenticated;
create role service_role bypassrls;
create table benchmark_cases (id uuid primary key, title text not null);
create table benchmark_runs (id uuid primary key, case_id uuid not null, status text not null, is_public boolean not null);
create table benchmark_attempts (id uuid primary key, run_id uuid not null, suite_slug text not null, suite_version text not null, status text not null);
create table hosted_web_sessions (run_id uuid not null, sequence_index int not null, first_seen_user_agent text);
create table hosted_web_results (run_id uuid not null, app text, task_slug text, status text, score numeric, summary text, created_at timestamptz not null);

insert into benchmark_cases values ('10000000-0000-0000-0000-000000000001', 'Hosted Web Suite');
insert into benchmark_runs values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'completed', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'completed', false);
insert into benchmark_attempts values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'suite', 'v2', 'completed'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'suite', 'v2', 'completed');
insert into hosted_web_sessions values
  ('20000000-0000-0000-0000-000000000001', 0, 'public-agent'),
  ('20000000-0000-0000-0000-000000000002', 0, 'private-agent');
insert into hosted_web_results values
  ('20000000-0000-0000-0000-000000000001', 'wiki-lite', 'wiki-release-answer', 'passed', 1, 'ok', now()),
  ('20000000-0000-0000-0000-000000000002', 'wiki-lite', 'wiki-release-answer', 'passed', 1, 'private', now());
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/supabase/migrations/20260622000022_hosted_public_read_models.sql" >/dev/null

[[ "$(${PSQL[@]} -Atqc 'set role anon; select count(*) from public_hosted_run_summaries')" == "1" ]]
[[ "$(${PSQL[@]} -Atqc 'set role anon; select observed_user_agent from public_hosted_run_summaries')" == "public-agent" ]]
[[ "$(${PSQL[@]} -Atqc 'set role anon; select count(*) from public_hosted_run_tasks')" == "1" ]]

echo "hosted public read-model Postgres tests passed"
