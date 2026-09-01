#!/usr/bin/env bash
set -euo pipefail

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_EXECUTOR="${ROOT_DIR}/scripts/lib/exec-postgres-url.py"

if [ -z "${SOURCE_DATABASE_URL}" ] || [ -z "${TARGET_DATABASE_URL}" ]; then
  echo "SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required." >&2
  exit 1
fi

if [ -n "${POSTGRES_TOOLS_CONTAINER:-}" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required when POSTGRES_TOOLS_CONTAINER is set." >&2
    exit 1
  fi
  for command in pg_dump pg_restore psql; do
    if ! docker exec "${POSTGRES_TOOLS_CONTAINER}" sh -c "command -v ${command}" >/dev/null 2>&1; then
      echo "${command} is unavailable in POSTGRES_TOOLS_CONTAINER." >&2
      exit 1
    fi
  done
else
  for command in pg_dump pg_restore psql; do
    if ! command -v "${command}" >/dev/null 2>&1; then
      echo "${command} is required." >&2
      exit 1
    fi
  done
fi

tables=(
  auth_users
  auth_accounts
  auth_sessions
  auth_verification_tokens
  profiles
  benchmark_cases
  benchmark_case_revisions
  model_catalog
  model_catalog_sync_runs
  benchmark_runs
  run_events
  artifacts
  benchmark_attempts
  hosted_web_sessions
  hosted_web_results
  benchmark_attempt_scores
  hosted_web_events
  hosted_web_access_logs
  hosted_callback_outbox
  orchestrator_command_dead_letters
)

archive="$(mktemp -t agentbench-data-transfer.XXXXXX)"
cleanup() {
  rm -f "${archive}"
}
trap cleanup EXIT

count_query() {
  local query=""
  local table
  for table in "${tables[@]}"; do
    query+="select '${table}' as table_name, count(*)::text as row_count from public.${table};"
  done
  printf '%s' "${query}"
}

target_total_query="select "
for table in "${tables[@]}"; do
  target_total_query+="(select count(*) from public.${table}) + "
done
target_total_query="${target_total_query% + };"

target_rows="$(DATABASE_COMMAND_URL="${TARGET_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  psql -X -v ON_ERROR_STOP=1 -Atqc "${target_total_query}")"
if [ "${target_rows}" != "0" ]; then
  echo "Target database must contain no application rows; create a fresh candidate database." >&2
  exit 1
fi

active_runs="$(DATABASE_COMMAND_URL="${SOURCE_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  psql -X -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from public.benchmark_runs where status not in ('completed', 'failed', 'cancelled', 'timeout');")"
if [ "${active_runs}" != "0" ]; then
  echo "Source database has ${active_runs} active runs; freeze writes and terminate or complete them before transfer." >&2
  exit 1
fi

dump_args=(
  --format=custom
  --data-only
  --no-owner
  --no-privileges
  --serializable-deferrable
)
for table in "${tables[@]}"; do
  dump_args+=(--table="public.${table}")
done

DATABASE_COMMAND_URL="${SOURCE_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  pg_dump "${dump_args[@]}" >"${archive}"

{
  echo "begin;"
  cat <<'SQL'
alter table public.profiles add column email text;
alter table public.profiles add column display_name text;
alter table public.profiles add column plan text;
alter table public.profiles add column created_at timestamp with time zone;
alter table public.benchmark_runs drop constraint benchmark_runs_identity_check;
SQL
  echo "alter table public.benchmark_cases drop constraint benchmark_cases_current_revision_id_fkey;"
  echo "alter table public.benchmark_case_revisions drop constraint benchmark_case_revisions_case_id_benchmark_cases_id_fk;"
  DATABASE_COMMAND_URL="${TARGET_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
    pg_restore --data-only --no-owner --no-privileges --file=- <"${archive}"
  cat <<'SQL'
alter table public.benchmark_case_revisions
  add constraint benchmark_case_revisions_case_id_benchmark_cases_id_fk
  foreign key (case_id)
  references public.benchmark_cases(id)
  on delete restrict;
alter table public.benchmark_cases
  add constraint benchmark_cases_current_revision_id_fkey
  foreign key (id, current_revision_id)
  references public.benchmark_case_revisions(case_id, id)
  on delete restrict;
alter table public.profiles drop column email;
alter table public.profiles drop column display_name;
alter table public.profiles drop column plan;
alter table public.profiles drop column created_at;
update public.benchmark_runs
set guest_id = 'legacy-migration:' || id::text
where user_id is null and guest_id is null;
alter table public.benchmark_runs
  add constraint benchmark_runs_identity_check
  check (user_id is not null or guest_id is not null);
commit;
SQL
} | DATABASE_COMMAND_URL="${TARGET_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  psql -X -v ON_ERROR_STOP=1 >/dev/null

source_counts="$(DATABASE_COMMAND_URL="${SOURCE_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  psql -X -v ON_ERROR_STOP=1 -AtF= -c "$(count_query)" | sort)"
target_counts="$(DATABASE_COMMAND_URL="${TARGET_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  psql -X -v ON_ERROR_STOP=1 -AtF= -c "$(count_query)" | sort)"
if [ "${source_counts}" != "${target_counts}" ]; then
  echo "Source and target row counts differ after transfer." >&2
  diff <(printf '%s\n' "${source_counts}") <(printf '%s\n' "${target_counts}") >&2 || true
  exit 1
fi

analyze_query=""
for table in "${tables[@]}"; do
  analyze_query+="analyze public.${table};"
done
DATABASE_COMMAND_URL="${TARGET_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  psql -X -v ON_ERROR_STOP=1 -Atqc "${analyze_query}" >/dev/null

echo "PostgreSQL data transfer and row-count validation passed."
