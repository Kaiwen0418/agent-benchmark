#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_EXECUTOR="${ROOT_DIR}/scripts/lib/exec-postgres-url.py"
# shellcheck source=lib/application-tables.sh
source "${ROOT_DIR}/scripts/lib/application-tables.sh"

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
EXPECTED_SOURCE_DATABASE_NAME="${EXPECTED_SOURCE_DATABASE_NAME:-}"
EXPECTED_TARGET_DATABASE_NAME="${EXPECTED_TARGET_DATABASE_NAME:-}"
VERIFIED_BACKUP_FILE="${VERIFIED_BACKUP_FILE:-}"
RESTORE_VERIFICATION_FILE="${RESTORE_VERIFICATION_FILE:-}"

required_variables=(
  SOURCE_DATABASE_URL
  TARGET_DATABASE_URL
  EXPECTED_SOURCE_DATABASE_NAME
  EXPECTED_TARGET_DATABASE_NAME
  VERIFIED_BACKUP_FILE
  RESTORE_VERIFICATION_FILE
)
for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "${variable} is required." >&2
    exit 1
  fi
done

for database_name in "${EXPECTED_SOURCE_DATABASE_NAME}" "${EXPECTED_TARGET_DATABASE_NAME}"; do
  if [[ ! "${database_name}" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "Expected database names may contain only letters, numbers, and underscores." >&2
    exit 1
  fi
done

if [[ "${SOURCE_DATABASE_URL}" == "${TARGET_DATABASE_URL}" ]] \
  || [[ "${EXPECTED_SOURCE_DATABASE_NAME}" == "${EXPECTED_TARGET_DATABASE_NAME}" ]]; then
  echo "Source and target databases must be distinct." >&2
  exit 1
fi
if [[ "${EXPECTED_TARGET_DATABASE_NAME}" != *_candidate ]]; then
  echo "Production preflight target database must end in _candidate." >&2
  exit 1
fi
target_name_lower="$(printf '%s' "${EXPECTED_TARGET_DATABASE_NAME}" | tr '[:upper:]' '[:lower:]')"
if [[ "${target_name_lower}" =~ (^|_)(dev|development|test|testing|local)($|_) ]]; then
  echo "Production preflight refuses a development, test, or local target database." >&2
  exit 1
fi

if [[ ! -s "${VERIFIED_BACKUP_FILE}" ]]; then
  echo "VERIFIED_BACKUP_FILE must identify a non-empty PostgreSQL custom-format backup." >&2
  exit 1
fi
if ! DATABASE_COMMAND_URL="${SOURCE_DATABASE_URL}" "${DATABASE_EXECUTOR}" \
  pg_restore --list <"${VERIFIED_BACKUP_FILE}" >/dev/null 2>&1; then
  echo "VERIFIED_BACKUP_FILE is not a readable PostgreSQL custom-format backup." >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  backup_sha256="$(sha256sum "${VERIFIED_BACKUP_FILE}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  backup_sha256="$(shasum -a 256 "${VERIFIED_BACKUP_FILE}" | awk '{print $1}')"
else
  echo "sha256sum or shasum is required to validate restore evidence." >&2
  exit 1
fi
if [[ ! -s "${RESTORE_VERIFICATION_FILE}" ]] \
  || ! grep -Fqx "backup_sha256=${backup_sha256}" "${RESTORE_VERIFICATION_FILE}" \
  || ! grep -Fqx "PostgreSQL backup restore verification passed." "${RESTORE_VERIFICATION_FILE}"; then
  echo "RESTORE_VERIFICATION_FILE does not contain successful restore evidence." >&2
  exit 1
fi

manifest_values=""
target_total_query="select "
for table in "${APPLICATION_TABLES[@]}"; do
  manifest_values+="('${table}'),"
  target_total_query+="(select count(*) from public.${table}) + "
done
manifest_values="${manifest_values%,}"
target_total_query="${target_total_query% + };"

database_query() {
  local url="$1"
  local query="$2"
  DATABASE_COMMAND_URL="${url}" "${DATABASE_EXECUTOR}" \
    psql -X -v ON_ERROR_STOP=1 -Atqc "${query}"
}

identity_query="select concat_ws('|', current_database(), coalesce(inet_server_addr()::text, 'local'), inet_server_port());"
source_identity="$(database_query "${SOURCE_DATABASE_URL}" "${identity_query}")"
target_identity="$(database_query "${TARGET_DATABASE_URL}" "${identity_query}")"
source_name="${source_identity%%|*}"
target_name="${target_identity%%|*}"

if [[ "${source_name}" != "${EXPECTED_SOURCE_DATABASE_NAME}" ]]; then
  echo "Source database identity does not match the expected name." >&2
  exit 1
fi
if [[ "${target_name}" != "${EXPECTED_TARGET_DATABASE_NAME}" ]]; then
  echo "Target database identity does not match the expected name." >&2
  exit 1
fi
if [[ "${source_identity}" == "${target_identity}" ]]; then
  echo "Source and target resolve to the same PostgreSQL database." >&2
  exit 1
fi

missing_query="with required(table_name) as (values ${manifest_values})
select count(*)
from required
left join information_schema.tables actual
  on actual.table_schema = 'public'
 and actual.table_type = 'BASE TABLE'
 and actual.table_name = required.table_name
where actual.table_name is null;"
unexpected_query="with required(table_name) as (values ${manifest_values})
select count(*)
from information_schema.tables actual
left join required
  on required.table_name = actual.table_name
where actual.table_schema = 'public'
  and actual.table_type = 'BASE TABLE'
  and required.table_name is null;"
source_missing_tables="$(database_query "${SOURCE_DATABASE_URL}" "${missing_query}")"
target_missing_tables="$(database_query "${TARGET_DATABASE_URL}" "${missing_query}")"
source_unexpected_tables="$(database_query "${SOURCE_DATABASE_URL}" "${unexpected_query}")"
target_unexpected_tables="$(database_query "${TARGET_DATABASE_URL}" "${unexpected_query}")"
if [[ "${source_missing_tables}" != "0" || "${target_missing_tables}" != "0" \
  || "${source_unexpected_tables}" != "0" || "${target_unexpected_tables}" != "0" ]]; then
  echo "Source or target public tables differ from the application transfer manifest." >&2
  exit 1
fi

required_objects_query="select (
  to_regclass('public.public_hosted_run_summaries') is not null
  and to_regclass('public.public_hosted_run_tasks') is not null
  and to_regprocedure('public.complete_hosted_attempt_session(uuid,uuid,timestamp with time zone,jsonb,jsonb)') is not null
  and to_regprocedure('public.timeout_hosted_attempt(uuid,timestamp with time zone,uuid,jsonb)') is not null
);"
source_schema_valid="$(database_query "${SOURCE_DATABASE_URL}" "${required_objects_query}")"
target_schema_valid="$(database_query "${TARGET_DATABASE_URL}" "${required_objects_query}")"
if [[ "${source_schema_valid}" != "t" || "${target_schema_valid}" != "t" ]]; then
  echo "Source or target is missing required views or lifecycle functions." >&2
  exit 1
fi

active_runs="$(database_query "${SOURCE_DATABASE_URL}" \
  "select count(*) from public.benchmark_runs where status not in ('completed', 'failed', 'cancelled', 'timeout');")"
callback_backlog="$(database_query "${SOURCE_DATABASE_URL}" \
  "select count(*) from public.hosted_callback_outbox where status in ('pending', 'delivering');")"
target_rows="$(database_query "${TARGET_DATABASE_URL}" "${target_total_query}")"

if [[ "${active_runs}" != "0" ]]; then
  echo "Production migration preflight is blocked by active benchmark runs." >&2
  exit 1
fi
if [[ "${callback_backlog}" != "0" ]]; then
  echo "Production migration preflight is blocked by pending callback delivery." >&2
  exit 1
fi
if [[ "${target_rows}" != "0" ]]; then
  echo "Production migration candidate contains application rows." >&2
  exit 1
fi

cat <<EOF
preflight=passed
source_database=${source_name}
target_database=${target_name}
manifest_tables=${#APPLICATION_TABLES[@]}
active_runs=${active_runs}
callback_backlog=${callback_backlog}
target_application_rows=${target_rows}
source_schema_valid=true
target_schema_valid=true
backup_archive_valid=true
backup_restore_digest_match=true
restore_verification_present=true
checked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
