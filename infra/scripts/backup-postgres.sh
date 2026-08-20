#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.database.yml"
ENV_FILE="${1:-}"
OUTPUT_DIR="${2:-}"

if [ -z "${ENV_FILE}" ] || [ -z "${OUTPUT_DIR}" ]; then
  echo "Usage: infra/scripts/backup-postgres.sh <database-env-file> <output-directory>" >&2
  exit 2
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "Database environment file not found: ${ENV_FILE}" >&2
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

mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_path="${OUTPUT_DIR%/}/agentbench-${timestamp}.dump"
temporary_path="${output_path}.tmp"
trap 'rm -f "${temporary_path}"' EXIT

"${compose[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -ceu 'pg_dump -U "$POSTGRES_USER" -d "$AGENTBENCH_DATABASE_NAME" --format=custom --no-owner --no-acl' \
  >"${temporary_path}"

chmod 600 "${temporary_path}"
mv "${temporary_path}" "${output_path}"
trap - EXIT
echo "PostgreSQL backup created: ${output_path}"
