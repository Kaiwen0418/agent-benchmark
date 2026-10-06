#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${DATABASE_COMPOSE_FILE:-${ROOT_DIR}/infra/docker/docker-compose.database.yml}"
ENV_FILE="${1:-}"
BACKUP_FILE="${2:-}"

if [ -z "${ENV_FILE}" ] || [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: infra/scripts/verify-postgres-backup.sh <database-env-file> <backup-file>" >&2
  exit 2
fi

if [ ! -f "${ENV_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "Database environment file and backup file must exist." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "Docker Compose is required." >&2
  exit 1
fi

restore_database="agentbench_restore_check_${$}"
database_name_pattern='^agentbench_restore_check_[0-9]+$'
if [[ ! "${restore_database}" =~ ${database_name_pattern} ]]; then
  echo "Unsafe restore verification database name." >&2
  exit 1
fi

database_exec=("${compose[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres)
cleanup() {
  "${database_exec[@]}" sh -ceu 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' -- \
    "${restore_database}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${database_exec[@]}" sh -ceu 'createdb -U "$POSTGRES_USER" "$1"' -- "${restore_database}"
"${database_exec[@]}" sh -ceu 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl' -- \
  "${restore_database}" <"${BACKUP_FILE}"

assertion="
select
  to_regclass('public.benchmark_runs') is not null
  and to_regclass('public.hosted_web_sessions') is not null
  and to_regclass('public.hosted_callback_outbox') is not null
  and to_regclass('public.orchestrator_command_dead_letters') is not null
  and exists (
    select 1
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name = 'complete_hosted_attempt_session'
  )
  and exists (select 1 from public.benchmark_cases)
  and exists (select 1 from public.benchmark_case_revisions);
"

result="$("${database_exec[@]}" sh -ceu 'psql -U "$POSTGRES_USER" -d "$1" -Atqc "$2"' -- \
  "${restore_database}" "${assertion}")"
if [ "${result}" != "t" ]; then
  echo "Restored database failed integrity checks." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  backup_sha256="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  backup_sha256="$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')"
else
  echo "sha256sum or shasum is required to record restore evidence." >&2
  exit 1
fi

echo "backup_sha256=${backup_sha256}"
echo "PostgreSQL backup restore verification passed."
