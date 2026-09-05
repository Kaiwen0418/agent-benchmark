#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DATABASE_COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.database-production.yml"
export COMPOSE_PROJECT_NAME="agentbench-production-db-check-${$}"
export PRODUCTION_DATABASE_PASSWORD="$(openssl rand -hex 24)"
export PRODUCTION_DATABASE_ADMIN_PASSWORD="$(openssl rand -hex 24)"
export PRODUCTION_DATABASE_DIRECT_PORT=0
export PRODUCTION_DATABASE_POOL_PORT=0
temporary_dir="$(mktemp -d)"
chmod 700 "${temporary_dir}"
touch "${temporary_dir}/database.env"
if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
else
  compose=(docker-compose)
fi
compose+=(--env-file "${temporary_dir}/database.env" -f "${DATABASE_COMPOSE_FILE}")
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${temporary_dir}"
}
trap cleanup EXIT

if PRODUCTION_DATABASE_PASSWORD= "${compose[@]}" config --quiet >/dev/null 2>&1; then
  echo "Production Compose accepted an empty application password." >&2
  exit 1
fi
if PRODUCTION_DATABASE_ADMIN_PASSWORD= "${compose[@]}" config --quiet >/dev/null 2>&1; then
  echo "Production Compose accepted an empty admin password." >&2
  exit 1
fi

"${compose[@]}" config --format json | python3 -c '
import json, os, sys
c = json.load(sys.stdin)
assert c["name"] == os.environ["COMPOSE_PROJECT_NAME"]
assert c["volumes"]["postgres-data"]["name"] == c["name"] + "_postgres-data"
assert not c["volumes"]["postgres-data"].get("external")
for name in ("postgres", "pgbouncer"):
    service = c["services"][name]
    assert service["ports"][0]["host_ip"] == "127.0.0.1"
    assert service["restart"] == "unless-stopped"
assert c["services"]["postgres"]["environment"]["AGENTBENCH_DATABASE_NAME"] == "agentbench_production_candidate"
assert c["services"]["pgbouncer"]["environment"]["POOL_MODE"] == "transaction"
'

"${compose[@]}" up -d --wait --wait-timeout 120 >/dev/null
postgres_id="$("${compose[@]}" ps -q postgres)"
export PGPASSWORD="${PRODUCTION_DATABASE_PASSWORD}"

# Connect over the project network through PgBouncer, not PostgreSQL directly.
pooled_sql() {
  docker exec -e PGPASSWORD "${postgres_id}" psql -X -v ON_ERROR_STOP=1 \
    -h pgbouncer -p 5432 -U agentbench_prod -d agentbench_production_candidate "$@"
}
[[ "$(pooled_sql -Atqc 'select current_database()')" == "agentbench_production_candidate" ]]
[[ "$(pooled_sql -Atqc 'select rolsuper or rolcreatedb or rolcreaterole from pg_roles where rolname = current_user')" == "f" ]]
if PGPASSWORD=incorrect pooled_sql -Atqc 'select 1' >/dev/null 2>&1; then
  echo "PgBouncer accepted the wrong application password." >&2
  exit 1
fi

direct_address="$("${compose[@]}" port postgres 5432)"
export DATABASE_DIRECT_URL="postgresql://agentbench_prod:${PRODUCTION_DATABASE_PASSWORD}@${direct_address}/agentbench_production_candidate"
cd "${ROOT_DIR}"
bash scripts/db-migrate.sh test >/dev/null
pnpm catalog:publish >/dev/null
[[ "$(pooled_sql -Atqc 'select count(*) from public.benchmark_cases')" == "2" ]]
"${compose[@]}" restart postgres >/dev/null
"${compose[@]}" up -d --wait --wait-timeout 120 >/dev/null
[[ "$(pooled_sql -Atqc 'select count(*) from public.benchmark_cases')" == "2" ]]

# Exercise the actual operational backup and restore scripts with this project.
bash infra/scripts/backup-postgres.sh "${temporary_dir}/database.env" "${temporary_dir}/backups" >/dev/null
backups=("${temporary_dir}"/backups/*.dump)
bash infra/scripts/verify-postgres-backup.sh "${temporary_dir}/database.env" "${backups[0]}" \
  >"${temporary_dir}/receipt"
grep -Eq '^backup_sha256=[a-f0-9]{64}$' "${temporary_dir}/receipt"
grep -Fqx 'PostgreSQL backup restore verification passed.' "${temporary_dir}/receipt"
[[ "$(pooled_sql -Atqc 'select count(*) from public.benchmark_cases')" == "2" ]]
echo "Production database isolation, pooled authentication, restart and restore tests passed."
