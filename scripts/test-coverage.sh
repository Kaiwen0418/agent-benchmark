#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

REDIS_CONTAINER=""
if [[ -z "${REDIS_TEST_URL:-}" ]]; then
  REDIS_PORT="$((5800 + (RANDOM % 500)))"
  REDIS_CONTAINER="agentbench-coverage-redis-$RANDOM"
  docker run -d --rm --name "${REDIS_CONTAINER}" -p "127.0.0.1:${REDIS_PORT}:6379" redis:7-alpine >/dev/null
  export REDIS_TEST_URL="redis://127.0.0.1:${REDIS_PORT}"
fi

cleanup() {
  if [[ -n "${REDIS_CONTAINER}" ]]; then
    docker rm -f "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if node -e "const net=require('node:net');const socket=net.connect(${REDIS_TEST_URL##*:},'127.0.0.1',()=>{socket.end();process.exit(0)});socket.on('error',()=>process.exit(1))"; then
    break
  fi
  sleep 1
done

pnpm --filter @agentbench/scoring build
pnpm --filter @agentbench/test-cases build

(
  cd apps/hosted-orchestrator
  node --import tsx --test \
    --experimental-test-coverage \
    --test-coverage-lines=65 \
    --test-coverage-branches=75 \
    --test-coverage-functions=70 \
    $(find tests/unit -type f -name '*.test.ts' | sort)
)

(
  cd apps/hosted-sites
  node --import tsx --test \
    --experimental-test-coverage \
    --test-coverage-lines=70 \
    --test-coverage-branches=80 \
    --test-coverage-functions=70 \
    $(find tests/unit -type f -name '*.test.ts' | sort)
)

(
  cd packages/scoring
  node --import tsx --test \
    --experimental-test-coverage \
    --test-coverage-lines=75 \
    --test-coverage-branches=90 \
    --test-coverage-functions=80 \
    tests/unit/*.test.ts
)
