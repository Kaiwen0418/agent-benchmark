#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  AGENTBENCH_WEB_URL
  COMPOSE_PROJECT_NAME
  DEPLOYMENT_ENVIRONMENT
  GATEWAY_HTTP_PORT
  GHCR_PAT
  GHCR_USERNAME
  GITHUB_REPOSITORY_OWNER
  HOSTED_ORCHESTRATOR_PUBLIC_URL
  HOSTED_SITES_PUBLIC_URL
  IMAGE_CHANNEL
  IMAGE_TAG
  NEXT_PUBLIC_SUPABASE_URL
  RUNNER_SHARED_SECRET
  SUPABASE_SERVICE_ROLE_KEY
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required deployment variable ${variable} is not set." >&2
    exit 1
  fi
done

case "${DEPLOYMENT_ENVIRONMENT}:${COMPOSE_PROJECT_NAME}:${IMAGE_CHANNEL}" in
  development:agentbench-development:develop | production:agentbench-production:main)
    ;;
  *)
    echo "Invalid deployment mapping: ${DEPLOYMENT_ENVIRONMENT}:${COMPOSE_PROJECT_NAME}:${IMAGE_CHANNEL}." >&2
    exit 1
    ;;
esac

HOSTED_SITES_CHANGED="${HOSTED_SITES_CHANGED:-false}"
ORCHESTRATOR_CHANGED="${ORCHESTRATOR_CHANGED:-false}"
INFRA_CHANGED="${INFRA_CHANGED:-false}"
TOPOLOGY_CHANGED="${TOPOLOGY_CHANGED:-false}"
ORCHESTRATOR_PARTITION_COUNT=16
ORCHESTRATOR_WORKER_0_PARTITIONS='0,1,2,3,4,5,6,7'
ORCHESTRATOR_WORKER_1_PARTITIONS='8,9,10,11,12,13,14,15'

OWNER="$(printf '%s' "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')"
HOSTED_IMAGE="ghcr.io/${OWNER}/agentbench-hosted-sites"
ORCHESTRATOR_IMAGE="ghcr.io/${OWNER}/agentbench-hosted-orchestrator"
HOSTED_SITES_IMAGE_TAG="latest-${IMAGE_CHANNEL}"
HOSTED_ORCHESTRATOR_IMAGE_TAG="latest-${IMAGE_CHANNEL}"

if [[ "${HOSTED_SITES_CHANGED}" == "true" ]]; then
  HOSTED_SITES_IMAGE_TAG="${IMAGE_TAG}"
fi
if [[ "${ORCHESTRATOR_CHANGED}" == "true" ]]; then
  HOSTED_ORCHESTRATOR_IMAGE_TAG="${IMAGE_TAG}"
fi

GATEWAY_IMAGE="nginx:1.27-alpine"
case "$(uname -m)" in
  x86_64 | amd64)
    GATEWAY_PLATFORM="linux/amd64"
    ;;
  aarch64 | arm64)
    GATEWAY_PLATFORM="linux/arm64"
    ;;
  *)
    echo "Unsupported gateway host architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose plugin or docker-compose is required on the self-hosted runner." >&2
  exit 127
fi

ENV_FILE="${RUNNER_TEMP:-/tmp}/agentbench-${DEPLOYMENT_ENVIRONMENT}.env.server"
COMPOSE_FILE="infra/docker/docker-compose.server.yml"
cat > "${ENV_FILE}" <<EOF
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
HOSTED_SITES_IMAGE=${HOSTED_IMAGE}
HOSTED_ORCHESTRATOR_IMAGE=${ORCHESTRATOR_IMAGE}
HOSTED_SITES_IMAGE_TAG=${HOSTED_SITES_IMAGE_TAG}
HOSTED_ORCHESTRATOR_IMAGE_TAG=${HOSTED_ORCHESTRATOR_IMAGE_TAG}
AGENTBENCH_WEB_URL=${AGENTBENCH_WEB_URL}
RUNNER_SHARED_SECRET=${RUNNER_SHARED_SECRET}
HOSTED_SITES_PUBLIC_URL=${HOSTED_SITES_PUBLIC_URL}
HOSTED_ORCHESTRATOR_URL=http://hosted-orchestrator:3004
HOSTED_ORCHESTRATOR_PUBLIC_URL=${HOSTED_ORCHESTRATOR_PUBLIC_URL}
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
HOSTED_SESSION_REDIS_URL=redis://redis:6379
ORCHESTRATOR_REDIS_URL=redis://redis:6379
ORCHESTRATOR_PARTITION_COUNT=${ORCHESTRATOR_PARTITION_COUNT}
ORCHESTRATOR_WORKER_0_PARTITIONS=${ORCHESTRATOR_WORKER_0_PARTITIONS}
ORCHESTRATOR_WORKER_1_PARTITIONS=${ORCHESTRATOR_WORKER_1_PARTITIONS}
HOSTED_SESSION_REDIS_TTL_MS=21600000
REDIS_IMAGE=redis:7-alpine
GATEWAY_HTTP_PORT=${GATEWAY_HTTP_PORT}
GATEWAY_IMAGE=${GATEWAY_IMAGE}
GATEWAY_PLATFORM=${GATEWAY_PLATFORM}
EOF
chmod 600 "${ENV_FILE}"

compose() {
  "${COMPOSE[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

test -f infra/nginx/hosted-sites.conf
bash infra/scripts/validate-orchestrator-partitions.sh \
  "${ORCHESTRATOR_PARTITION_COUNT}" \
  "${ORCHESTRATOR_WORKER_0_PARTITIONS}" \
  "${ORCHESTRATOR_WORKER_1_PARTITIONS}"
compose config > "${RUNNER_TEMP:-/tmp}/agentbench-${DEPLOYMENT_ENVIRONMENT}-compose.yml"

dump_deploy_logs() {
  echo "---- deployment ----"
  echo "environment=${DEPLOYMENT_ENVIRONMENT} project=${COMPOSE_PROJECT_NAME} channel=${IMAGE_CHANNEL} port=${GATEWAY_HTTP_PORT}"
  echo "---- host architecture ----"
  uname -a || true
  echo "gateway image=${GATEWAY_IMAGE} platform=${GATEWAY_PLATFORM}"
  echo "---- environment keys ----"
  sed -n 's/^\([^=]*\)=.*/\1=<redacted>/p' "${ENV_FILE}" 2>/dev/null || true
  echo "---- docker compose ps ----"
  compose ps -a || true
  echo "---- matching containers ----"
  docker ps -a --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  echo "---- listening gateway port ----"
  (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null || true) | grep -E ":${GATEWAY_HTTP_PORT}\\b" || true
  echo "---- compose logs ----"
  compose logs --tail=160 gateway hosted-sites hosted-orchestrator \
    hosted-orchestrator-worker-0 hosted-orchestrator-worker-1 redis || true
}

deploy_status=0
trap 'deploy_status=$?; if [[ "${deploy_status}" -ne 0 ]]; then dump_deploy_logs; fi; rm -f "${ENV_FILE}"' EXIT

printf '%s' "${GHCR_PAT}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
HOSTED_REPLICAS="$(compose ps -q hosted-sites 2>/dev/null | wc -l | tr -d ' ')"
HOSTED_REPLICAS="${HOSTED_REPLICAS:-1}"
[[ "${HOSTED_REPLICAS}" -gt 0 ]] || HOSTED_REPLICAS=1

echo "Deploying ${DEPLOYMENT_ENVIRONMENT}: project=${COMPOSE_PROJECT_NAME}, channel=${IMAGE_CHANNEL}, port=${GATEWAY_HTTP_PORT}"
echo "Targets: hosted-sites=${HOSTED_SITES_CHANGED}, orchestrator=${ORCHESTRATOR_CHANGED}, nginx=${INFRA_CHANGED}, topology=${TOPOLOGY_CHANGED}"
echo "Image tags: hosted-sites=${HOSTED_SITES_IMAGE_TAG}, orchestrator=${HOSTED_ORCHESTRATOR_IMAGE_TAG}"

if [[ "${HOSTED_SITES_CHANGED}" == "true" ]]; then
  compose pull hosted-sites
  compose up -d --remove-orphans --no-deps --scale "hosted-sites=${HOSTED_REPLICAS}" hosted-sites
fi

if [[ "${ORCHESTRATOR_CHANGED}" == "true" ]]; then
  compose pull hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
  compose up -d --remove-orphans --no-deps \
    hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
fi

if [[ "${INFRA_CHANGED}" == "true" ]]; then
  docker pull --platform "${GATEWAY_PLATFORM}" "${GATEWAY_IMAGE}"
  docker run --rm --platform "${GATEWAY_PLATFORM}" --entrypoint nginx "${GATEWAY_IMAGE}" -v
  compose up -d --remove-orphans redis
  compose up -d --remove-orphans --force-recreate --no-deps gateway
fi

if [[ "${TOPOLOGY_CHANGED}" == "true" ]]; then
  compose up -d --remove-orphans redis
  compose up -d --remove-orphans --no-deps --scale "hosted-sites=${HOSTED_REPLICAS}" hosted-sites
  compose up -d --remove-orphans --no-deps \
    hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
  compose up -d --remove-orphans --force-recreate --no-deps gateway
fi

compose ps

gateway_running() {
  local gateway_id
  gateway_id="$(compose ps -q gateway 2>/dev/null)"
  [[ -n "${gateway_id}" ]] && [[ "$(docker inspect "${gateway_id}" --format '{{.State.Running}}' 2>/dev/null)" == "true" ]]
}

internal_smoke_check() {
  compose exec -T hosted-sites node -e "fetch('http://gateway/health').then(async (response) => { if (!response.ok) process.exit(1); const body = await response.json(); process.exit(body.sessionCache === 'redis' ? 0 : 1); }).catch((error) => { console.error(error); process.exit(1); })"
}

orchestrator_smoke_check() {
  compose exec -T hosted-sites node -e "fetch('http://gateway/orchestrator').then(async (response) => { const body = await response.json(); const complete = Array.isArray(body.missingPartitions) && body.missingPartitions.length === 0; process.exit(response.ok && body.ok === true && body.commandBackbone === 'redis-streams' && body.mode === 'api' && complete ? 0 : 1); }).catch((error) => { console.error(error); process.exit(1); })"
}

for attempt in $(seq 1 30); do
  if internal_smoke_check && orchestrator_smoke_check; then
    exit 0
  fi
  echo "Smoke check failed; retrying (${attempt}/30)."
  if ! gateway_running; then
    echo "Gateway is not running during smoke check." >&2
    exit 1
  fi
  sleep 2
done

exit 1
