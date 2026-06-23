#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose plugin or docker-compose is required for redis topology tests." >&2
  exit 127
fi

if grep -REn 'process\.env\.REDIS_URL|ORCHESTRATOR_REDIS_URL or REDIS_URL|HOSTED_SESSION_REDIS_URL \?\?' \
  apps/hosted-sites/src apps/hosted-orchestrator/src >/tmp/agentbench-redis-fallbacks.txt; then
  cat /tmp/agentbench-redis-fallbacks.txt >&2
  echo "runtime code must not fall back to shared REDIS_URL" >&2
  exit 1
fi

if ! grep -q '"hosted-sites:session:"' apps/hosted-sites/src/runtime/session-cache.ts; then
  echo "hosted-sites session cache namespace changed or is missing" >&2
  exit 1
fi
if ! grep -q 'agentbench:orchestrator:' apps/hosted-orchestrator/src/command-backbone.ts; then
  echo "orchestrator command namespace changed or is missing" >&2
  exit 1
fi
if grep -RFn 'agentbench:orchestrator:' apps/hosted-sites/src >/tmp/agentbench-redis-fallbacks.txt; then
  cat /tmp/agentbench-redis-fallbacks.txt >&2
  echo "hosted-sites must not issue orchestrator Redis commands" >&2
  exit 1
fi
if grep -RFn 'hosted-sites:session:' apps/hosted-orchestrator/src >/tmp/agentbench-redis-fallbacks.txt; then
  cat /tmp/agentbench-redis-fallbacks.txt >&2
  echo "orchestrator must not issue hosted-sites session cache commands" >&2
  exit 1
fi

local_config="$("${COMPOSE[@]}" -f docker-compose.yml config)"
if ! grep -Eq 'HOSTED_SESSION_REDIS_URL(: |=|=).*redis://session-redis:6379' <<< "${local_config}"; then
  echo "local hosted-sites must use session-redis" >&2
  exit 1
fi
if ! grep -Eq 'ORCHESTRATOR_REDIS_URL(: |=|=).*redis://orchestrator-redis:6379' <<< "${local_config}"; then
  echo "local orchestrator must use orchestrator-redis" >&2
  exit 1
fi

server_env="$(mktemp)"
trap 'rm -f "${server_env}" /tmp/agentbench-redis-fallbacks.txt' EXIT
cat > "${server_env}" <<'EOF'
COMPOSE_PROJECT_NAME=agentbench-test
HOSTED_ORCHESTRATOR_IMAGE=ghcr.io/example/agentbench-hosted-orchestrator
HOSTED_ORCHESTRATOR_IMAGE_TAG=test
HOSTED_ORCHESTRATOR_PUBLIC_URL=https://orchestrator.example.test
HOSTED_SITES_IMAGE=ghcr.io/example/agentbench-hosted-sites
HOSTED_SITES_IMAGE_TAG=test
HOSTED_SITES_PUBLIC_URL=https://hosted.example.test
HOSTED_ORCHESTRATOR_URL=http://hosted-orchestrator:3004
AGENTBENCH_WEB_URL=https://web.example.test
RUNNER_SHARED_SECRET=test-secret
SUPABASE_URL=https://supabase.example.test
SUPABASE_SERVICE_ROLE_KEY=test-service-role
HOSTED_SESSION_REDIS_URL=redis://session-redis:6379
ORCHESTRATOR_REDIS_URL=redis://orchestrator-redis:6379
ORCHESTRATOR_PARTITION_COUNT=16
ORCHESTRATOR_WORKER_0_PARTITIONS=0,1,2,3,4,5,6,7
ORCHESTRATOR_WORKER_1_PARTITIONS=8,9,10,11,12,13,14,15
GATEWAY_HTTP_PORT=18080
GATEWAY_IMAGE=nginx:1.27-alpine
GATEWAY_PLATFORM=linux/amd64
EOF

server_config="$(env -u HOSTED_SESSION_REDIS_URL -u ORCHESTRATOR_REDIS_URL \
  "${COMPOSE[@]}" --env-file "${server_env}" -f infra/docker/docker-compose.server.yml config)"
if ! grep -Eq 'HOSTED_SESSION_REDIS_URL(: |=|=).*redis://session-redis:6379' <<< "${server_config}"; then
  echo "server hosted-sites must use session-redis" >&2
  exit 1
fi
if ! grep -Eq 'ORCHESTRATOR_REDIS_URL(: |=|=).*redis://orchestrator-redis:6379' <<< "${server_config}"; then
  echo "server orchestrator must use orchestrator-redis" >&2
  exit 1
fi
if grep -q 'redis://redis:6379' <<< "${server_config}"; then
  echo "server compose must not use shared redis compatibility endpoint by default" >&2
  exit 1
fi

echo "redis topology tests passed"
