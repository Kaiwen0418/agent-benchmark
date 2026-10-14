#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Specify the protected runtime environment file}"
expected_environment="${2:-}"
[[ -f "${env_file}" ]] || exit 1
project="$(docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.single-vm.yml" config --format json | jq -r .name)"
case "$project" in
  agentbench-single-vm|agentbench-local-development) ;;
  *) echo 'Unexpected recovery project.' >&2; exit 1 ;;
esac
if [[ -n "${expected_environment}" ]]; then
  case "${expected_environment}" in
    production) expected_project=agentbench-single-vm; expected_database=agentbench_production; expected_direct_port=55432; expected_pool_port=65432 ;;
    development) expected_project=agentbench-local-development; expected_database=agentbench_development; expected_direct_port=55433; expected_pool_port=65433 ;;
    *) echo 'Expected production or development.' >&2; exit 1 ;;
  esac
  [[ "${project}" == "${expected_project}" ]] || { echo 'Database initialization environment mismatch.' >&2; exit 1; }
  docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.single-vm.yml" config --format json |
    jq -e --arg database "$expected_database" --arg direct "$expected_direct_port" --arg pool "$expected_pool_port" '
      .services.postgres.environment.AGENTBENCH_DATABASE_NAME == $database and
      .services.postgres.ports[0].published == $direct and .services.postgres.ports[0].host_ip == "127.0.0.1" and
      .services.pgbouncer.ports[0].published == $pool and .services.pgbouncer.ports[0].host_ip == "127.0.0.1"
    ' >/dev/null
fi
security_options="$(docker info --format '{{json .SecurityOptions}}')"
container_user="$(id -u):$(id -g)"
# Rootless container UID 0 maps to the unprivileged daemon owner, not host root.
if [[ "$security_options" == *name=rootless* ]]; then
  [[ "$project" == agentbench-local-development ]] || { echo 'Rootless migration is supported only for development.' >&2; exit 1; }
  container_user=0:0
  parent="$(docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.single-vm.yml" config --format json | jq -r '.services.postgres.cgroup_parent // ""')"
  [[ -n "$parent" ]] || { echo 'Rootless migration requires a development resource budget.' >&2; exit 1; }
  bash "$ROOT_DIR/infra/scripts/check-environment-resource-budget.sh" development "$parent"
  export AGENTBENCH_CGROUP_PARENT=
  docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.single-vm.yml" \
    up -d --wait postgres pgbouncer
fi
# Never install dependencies into a bind-mounted checkout. Ship only migration
# source, excluding host dependencies and environment files, to ephemeral storage.
tar --exclude=node_modules --exclude=dist --exclude='.env*' -cf - -C "$ROOT_DIR" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json packages scripts |
docker run --rm -i --network "${project}_default" \
  --user "$container_user" -e HOME=/tmp \
  --env-file "${env_file}" \
  node:22-bookworm-slim sh -ceu '
    mkdir -p /tmp/workspace
    tar -xf - -C /tmp/workspace
    cd /tmp/workspace
    export DATABASE_DIRECT_URL="postgresql://${SINGLE_VM_DATABASE_USER:-agentbench_prod}:${PRODUCTION_DATABASE_PASSWORD}@postgres:5432/${SINGLE_VM_DATABASE_NAME:-agentbench_production}"
    mkdir -p /tmp/bin
    corepack enable --install-directory /tmp/bin
    corepack prepare pnpm@10.0.0 --activate
    export PATH="/tmp/bin:${PATH}"
    pnpm install --store-dir /tmp/pnpm-store --ignore-scripts --frozen-lockfile --filter @agentbench/database --filter @agentbench/test-cases...
    bash scripts/db-migrate.sh "${SINGLE_VM_ENVIRONMENT:-production}"
    pnpm catalog:publish
  '
