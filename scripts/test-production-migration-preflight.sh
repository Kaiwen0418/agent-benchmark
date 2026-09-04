#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-production-preflight-$RANDOM"
BACKUP_FILE="$(mktemp -t agentbench-production-preflight.XXXXXX)"
RESTORE_EVIDENCE_FILE="$(mktemp -t agentbench-production-restore.XXXXXX)"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  rm -f "${BACKUP_FILE}" "${RESTORE_EVIDENCE_FILE}"
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

databases=(agentbench_source agentbench_production_candidate agentbench_nonempty_candidate missing_candidate)
for database in "${databases[@]}"; do
  docker exec "${CONTAINER}" createdb -U postgres "${database}"
done

mapped_address="$(docker port "${CONTAINER}" 5432/tcp)"
mapped_port="${mapped_address##*:}"
host_url() {
  printf 'postgresql://postgres:postgres@127.0.0.1:%s/%s' "${mapped_port}" "$1"
}
container_url() {
  printf 'postgresql://postgres:postgres@127.0.0.1:5432/%s' "$1"
}

cd "${ROOT_DIR}"
for database in agentbench_source agentbench_production_candidate agentbench_nonempty_candidate; do
  DATABASE_DIRECT_URL="$(host_url "${database}")" bash scripts/db-migrate.sh test >/dev/null
done
DATABASE_DIRECT_URL="$(host_url agentbench_source)" pnpm catalog:publish >/dev/null
DATABASE_DIRECT_URL="$(host_url agentbench_nonempty_candidate)" pnpm catalog:publish >/dev/null

docker exec "${CONTAINER}" pg_dump -U postgres -d agentbench_source \
  --format=custom --no-owner --no-acl >"${BACKUP_FILE}"
if command -v sha256sum >/dev/null 2>&1; then
  backup_sha256="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
else
  backup_sha256="$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')"
fi
printf 'backup_sha256=%s\n%s\n' "${backup_sha256}" \
  "PostgreSQL backup restore verification passed." >"${RESTORE_EVIDENCE_FILE}"

preflight() {
  POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="$(container_url agentbench_source)" \
  TARGET_DATABASE_URL="$(container_url agentbench_production_candidate)" \
  EXPECTED_SOURCE_DATABASE_NAME=agentbench_source \
  EXPECTED_TARGET_DATABASE_NAME=agentbench_production_candidate \
  VERIFIED_BACKUP_FILE="${BACKUP_FILE}" \
  RESTORE_VERIFICATION_FILE="${RESTORE_EVIDENCE_FILE}" \
    bash scripts/db-production-preflight.sh
}

expect_failure() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "Production preflight accepted ${description}." >&2
    exit 1
  fi
}

output="$(preflight)"
grep -Fqx "preflight=passed" <<<"${output}"
grep -Fqx "manifest_tables=20" <<<"${output}"
grep -Fqx "target_application_rows=0" <<<"${output}"
if grep -Fq "postgresql://" <<<"${output}"; then
  echo "Production preflight exposed a database URL." >&2
  exit 1
fi

printf '%s\n%s\n' "backup_sha256=invalid" \
  "PostgreSQL backup restore verification passed." >"${RESTORE_EVIDENCE_FILE}"
expect_failure "restore evidence for a different backup" preflight
printf 'backup_sha256=%s\n%s\n' "${backup_sha256}" \
  "PostgreSQL backup restore verification passed." >"${RESTORE_EVIDENCE_FILE}"

docker exec "${CONTAINER}" psql -U postgres -d agentbench_source -v ON_ERROR_STOP=1 \
  -c "create table public.untracked_preflight_table (id integer primary key)" >/dev/null
expect_failure "an untracked public table" preflight
docker exec "${CONTAINER}" psql -U postgres -d agentbench_source -v ON_ERROR_STOP=1 \
  -c "drop table public.untracked_preflight_table" >/dev/null

expect_failure "an incorrect source identity" env \
  POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="$(container_url agentbench_source)" \
  TARGET_DATABASE_URL="$(container_url agentbench_production_candidate)" \
  EXPECTED_SOURCE_DATABASE_NAME=wrong_source \
  EXPECTED_TARGET_DATABASE_NAME=agentbench_production_candidate \
  VERIFIED_BACKUP_FILE="${BACKUP_FILE}" RESTORE_VERIFICATION_FILE="${RESTORE_EVIDENCE_FILE}" \
  bash scripts/db-production-preflight.sh

expect_failure "the same source and target" env \
  POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="$(container_url agentbench_source)" \
  TARGET_DATABASE_URL="$(container_url agentbench_source)" \
  EXPECTED_SOURCE_DATABASE_NAME=agentbench_source \
  EXPECTED_TARGET_DATABASE_NAME=agentbench_source \
  VERIFIED_BACKUP_FILE="${BACKUP_FILE}" RESTORE_VERIFICATION_FILE="${RESTORE_EVIDENCE_FILE}" \
  bash scripts/db-production-preflight.sh

expect_failure "a development target" env \
  SOURCE_DATABASE_URL=postgresql://example/source \
  TARGET_DATABASE_URL=postgresql://example/target \
  EXPECTED_SOURCE_DATABASE_NAME=agentbench_source \
  EXPECTED_TARGET_DATABASE_NAME=agentbench_development_candidate \
  VERIFIED_BACKUP_FILE="${BACKUP_FILE}" RESTORE_VERIFICATION_FILE="${RESTORE_EVIDENCE_FILE}" \
  bash scripts/db-production-preflight.sh

expect_failure "a target with missing schema" env \
  POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="$(container_url agentbench_source)" \
  TARGET_DATABASE_URL="$(container_url missing_candidate)" \
  EXPECTED_SOURCE_DATABASE_NAME=agentbench_source \
  EXPECTED_TARGET_DATABASE_NAME=missing_candidate \
  VERIFIED_BACKUP_FILE="${BACKUP_FILE}" RESTORE_VERIFICATION_FILE="${RESTORE_EVIDENCE_FILE}" \
  bash scripts/db-production-preflight.sh

expect_failure "a non-empty target" env \
  POSTGRES_TOOLS_CONTAINER="${CONTAINER}" \
  SOURCE_DATABASE_URL="$(container_url agentbench_source)" \
  TARGET_DATABASE_URL="$(container_url agentbench_nonempty_candidate)" \
  EXPECTED_SOURCE_DATABASE_NAME=agentbench_source \
  EXPECTED_TARGET_DATABASE_NAME=agentbench_nonempty_candidate \
  VERIFIED_BACKUP_FILE="${BACKUP_FILE}" RESTORE_VERIFICATION_FILE="${RESTORE_EVIDENCE_FILE}" \
  bash scripts/db-production-preflight.sh

docker exec -i "${CONTAINER}" psql -U postgres -d agentbench_source -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.benchmark_runs (id, guest_id, case_id, status)
select '20000000-0000-4000-8000-000000000001', 'preflight-active', id, 'running'
from public.benchmark_cases order by slug limit 1;
SQL
expect_failure "an active run" preflight
docker exec "${CONTAINER}" psql -U postgres -d agentbench_source -v ON_ERROR_STOP=1 \
  -c "update public.benchmark_runs set status = 'completed', completed_at = now() where id = '20000000-0000-4000-8000-000000000001'" >/dev/null

docker exec -i "${CONTAINER}" psql -U postgres -d agentbench_source -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.benchmark_attempts (
  id, run_id, case_id, provider, suite_slug, suite_version, status
)
select
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  case_id,
  'hosted-web',
  'preflight-suite',
  'v1',
  'completed'
from public.benchmark_runs
where id = '20000000-0000-4000-8000-000000000001';

insert into public.hosted_callback_outbox (attempt_id, run_id, payload)
values (
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '{"type":"preflight"}'
);
SQL
expect_failure "a callback backlog" preflight

echo "Production PostgreSQL migration preflight tests passed"
