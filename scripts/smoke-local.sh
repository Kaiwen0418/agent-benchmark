#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOSTED_PORT="${HOSTED_SITES_PORT:-$((3100 + (RANDOM % 700)))}"
ORCHESTRATOR_PORT="${HOSTED_ORCHESTRATOR_PORT:-$((4100 + (RANDOM % 700)))}"
HOSTED_URL="http://127.0.0.1:${HOSTED_PORT}"
ORCHESTRATOR_URL="http://127.0.0.1:${ORCHESTRATOR_PORT}"
SECRET="local-smoke-secret"
LOG_DIR="$(mktemp -d)"
REDIS_URL="${REDIS_TEST_URL:-}"
REDIS_CONTAINER=""

cleanup() {
  kill_tree() {
    local pid="$1"
    local child
    for child in $(pgrep -P "${pid}" 2>/dev/null || true); do
      kill_tree "${child}"
    done
    kill "${pid}" >/dev/null 2>&1 || true
  }
  for pid in "${HOSTED_PID:-}" "${ORCHESTRATOR_PID:-}"; do
    if [[ -n "${pid}" ]]; then
      kill_tree "${pid}"
      wait "${pid}" 2>/dev/null || true
    fi
  done
  if [[ -n "${REDIS_CONTAINER}" ]]; then
    docker rm -f "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
  fi
  rm -rf "${LOG_DIR}"
}
trap cleanup EXIT
trap 'status=$?; if [[ ${status} -ne 0 ]]; then cat "${LOG_DIR}/hosted-sites.log" "${LOG_DIR}/orchestrator.log" >&2 2>/dev/null || true; fi' ERR

cd "${ROOT_DIR}"

if [[ -z "${REDIS_URL}" ]]; then
  REDIS_PORT="$((5100 + (RANDOM % 700)))"
  REDIS_CONTAINER="agentbench-prepush-redis-$RANDOM"
  docker run -d --rm --name "${REDIS_CONTAINER}" -p "127.0.0.1:${REDIS_PORT}:6379" redis:7-alpine >/dev/null
  REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
fi

for _ in $(seq 1 30); do
  if node -e "const net=require('node:net');const socket=net.connect(${REDIS_URL##*:},'127.0.0.1',()=>{socket.end();process.exit(0)});socket.on('error',()=>process.exit(1))"; then
    break
  fi
  sleep 1
done

HOSTED_ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT}" \
HOSTED_ORCHESTRATOR_PUBLIC_URL="${ORCHESTRATOR_URL}" \
HOSTED_SITES_URL="${HOSTED_URL}" \
RUNNER_SHARED_SECRET="${SECRET}" \
ORCHESTRATOR_REDIS_URL="${REDIS_URL}" \
pnpm --filter hosted-orchestrator exec tsx src/server.ts >"${LOG_DIR}/orchestrator.log" 2>&1 &
ORCHESTRATOR_PID=$!

HOSTED_SITES_PORT="${HOSTED_PORT}" \
HOSTED_SITES_PUBLIC_URL="${HOSTED_URL}" \
HOSTED_ORCHESTRATOR_URL="${ORCHESTRATOR_URL}" \
RUNNER_SHARED_SECRET="${SECRET}" \
pnpm --filter hosted-sites exec tsx src/server.ts >"${LOG_DIR}/hosted-sites.log" 2>&1 &
HOSTED_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "${HOSTED_URL}/health" >/dev/null && curl -fsS "${ORCHESTRATOR_URL}/health" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${HOSTED_URL}/health" >/dev/null || ! curl -fsS "${ORCHESTRATOR_URL}/health" >/dev/null; then
  cat "${LOG_DIR}/hosted-sites.log" "${LOG_DIR}/orchestrator.log" >&2
  exit 1
fi

SESSION_JSON="$(curl -fsS -X POST "${HOSTED_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d '{
    "app": "shopping-lite",
    "taskSlug": "local-generated-shopping-smoke",
    "goal": "Buy one charger under $30 with standard shipping.",
    "startPath": "/shopping",
    "metadata": {
      "questionGeneration": {
        "schemaVersion": 1,
        "generationSeed": "local-smoke",
        "variantId": "charger-standard",
        "uiVariant": "sidebar",
        "uiTheme": "dark",
        "taskConfig": {
          "targetCategory": "charger",
          "quantity": 1,
          "maxTotal": 30,
          "shippingMethod": "standard",
          "avoidRestricted": true
        }
      }
    }
  }')"

TOKEN="$(printf '%s' "${SESSION_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).token')"

curl -fsS "${HOSTED_URL}/shopping?session=${TOKEN}" | grep -F 'data-ui-variant="sidebar"' >/dev/null
curl -fsS "${HOSTED_URL}/shopping?session=${TOKEN}" | grep -F 'data-ui-theme="dark"' >/dev/null
curl -fsS -X POST "${HOSTED_URL}/shopping/cart?session=${TOKEN}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'productId=prod-charger-30w' >/dev/null
CHECKOUT_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${HOSTED_URL}/shopping/checkout?session=${TOKEN}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'shippingMethod=standard')"
if [[ "${CHECKOUT_STATUS}" != "502" ]]; then
  echo "expected standalone checkout to persist state and report unavailable orchestrator, got ${CHECKOUT_STATUS}" >&2
  exit 1
fi

curl -fsS "${HOSTED_URL}/api/sessions/${TOKEN}/score" | node -e '
const result = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (result.status !== "passed" || result.score !== 1) {
  throw new Error(`unexpected local smoke score: ${JSON.stringify(result)}`);
}
'

echo "local hosted smoke passed"
