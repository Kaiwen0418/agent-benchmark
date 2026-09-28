#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Specify the protected runtime environment file}"
[[ -f "${env_file}" ]] || exit 1
project="$(docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.single-vm.yml" config --format json | jq -r .name)"
case "$project" in
  agentbench-single-vm|agentbench-local-development) ;;
  *) echo 'Unexpected recovery project.' >&2; exit 1 ;;
esac
docker run --rm --network "${project}_default" \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  --env-file "${env_file}" -v "${ROOT_DIR}:/workspace" -w /workspace \
  node:22-bookworm-slim sh -ceu '
    export DATABASE_DIRECT_URL="postgresql://${SINGLE_VM_DATABASE_USER:-agentbench_prod}:${PRODUCTION_DATABASE_PASSWORD}@postgres:5432/${SINGLE_VM_DATABASE_NAME:-agentbench_production}"
    mkdir -p /tmp/bin
    corepack enable --install-directory /tmp/bin
    corepack prepare pnpm@10.0.0 --activate
    export PATH="/tmp/bin:${PATH}"
    pnpm install --store-dir /tmp/pnpm-store --ignore-scripts --frozen-lockfile --filter @agentbench/database --filter @agentbench/test-cases...
    bash scripts/db-migrate.sh "${SINGLE_VM_ENVIRONMENT:-production}"
    pnpm catalog:publish
  '
