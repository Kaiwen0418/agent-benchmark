#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CANARY_ACTION="${CANARY_ACTION:-deploy}"
COMPOSE_PROJECT="agentbench-cutover-canary"
BASE_COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.server.yml"
CANARY_COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.canary.yml"
ENV_FILE="${RUNNER_TEMP:-/tmp}/agentbench-cutover-canary.env"

case "${CANARY_ACTION}" in
  deploy | destroy)
    ;;
  *)
    echo "CANARY_ACTION must be deploy or destroy." >&2
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

cleanup() {
  rm -f "${ENV_FILE}"
}
trap cleanup EXIT

if [[ "${CANARY_ACTION}" == "destroy" ]]; then
  cat > "${ENV_FILE}" <<EOF
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT}
AGENTBENCH_WEB_IMAGE=unused
HOSTED_SITES_IMAGE=unused
HOSTED_ORCHESTRATOR_IMAGE=unused
IMAGE_TAG=unused
HOSTED_SITES_IMAGE_TAG=unused
HOSTED_ORCHESTRATOR_IMAGE_TAG=unused
HOSTED_SITES_PUBLIC_URL=http://canary.invalid
HOSTED_ORCHESTRATOR_PUBLIC_URL=http://canary.invalid/orchestrator
HOSTED_ORCHESTRATOR_URL=http://hosted-orchestrator:3004
AGENTBENCH_WEB_URL=http://web:3000
HOSTED_SESSION_REDIS_URL=redis://session-redis:6379
ORCHESTRATOR_REDIS_URL=redis://orchestrator-redis:6379
RUNNER_SHARED_SECRET=unused
DATABASE_URL=postgresql://unused/unused_candidate
EOF
  "${COMPOSE[@]}" --project-name "${COMPOSE_PROJECT}" --env-file "${ENV_FILE}" \
    -f "${BASE_COMPOSE_FILE}" -f "${CANARY_COMPOSE_FILE}" \
    down --volumes --remove-orphans
  echo "Removed the isolated ${COMPOSE_PROJECT} containers, network, and volumes."
  exit 0
fi

required_variables=(
  CANARY_HOST
  DATABASE_URL
  GHCR_PAT
  GHCR_USERNAME
  GITHUB_REPOSITORY_OWNER
  IMAGE_TAG
  RUNNER_SHARED_SECRET
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required canary deployment variable ${variable} is not set." >&2
    exit 1
  fi
done

database_name="${DATABASE_URL%%\?*}"
database_name="${database_name##*/}"
if [[ -z "${database_name}" || "${database_name}" != *_candidate ]]; then
  echo "Canary DATABASE_URL must target a database ending in _candidate." >&2
  exit 1
fi

if [[ ! "${IMAGE_TAG}" =~ ^[0-9a-f]{12}$ ]]; then
  echo "Canary IMAGE_TAG must be an immutable 12-character commit tag." >&2
  exit 1
fi

OWNER="$(printf '%s' "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')"
# shellcheck source=registry-retry.sh
source "${ROOT_DIR}/infra/scripts/registry-retry.sh"

cat > "${ENV_FILE}" <<EOF
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT}
AGENTBENCH_WEB_IMAGE=ghcr.io/${OWNER}/agentbench-web
HOSTED_SITES_IMAGE=ghcr.io/${OWNER}/agentbench-hosted-sites
HOSTED_ORCHESTRATOR_IMAGE=ghcr.io/${OWNER}/agentbench-hosted-orchestrator
HOSTED_SITES_IMAGE_TAG=${IMAGE_TAG}
HOSTED_ORCHESTRATOR_IMAGE_TAG=${IMAGE_TAG}
IMAGE_TAG=${IMAGE_TAG}
DATABASE_URL=${DATABASE_URL}
RUNNER_SHARED_SECRET=${RUNNER_SHARED_SECRET}
AGENTBENCH_WEB_URL=http://web:3000
HOSTED_SITES_PUBLIC_URL=http://${CANARY_HOST}:8182
HOSTED_ORCHESTRATOR_URL=http://hosted-orchestrator:3004
HOSTED_ORCHESTRATOR_PUBLIC_URL=http://${CANARY_HOST}:8182/orchestrator
HOSTED_SESSION_REDIS_URL=redis://session-redis:6379
ORCHESTRATOR_REDIS_URL=redis://orchestrator-redis:6379
ORCHESTRATOR_PARTITION_COUNT=16
ORCHESTRATOR_WORKER_0_PARTITIONS=0,1,2,3,4,5,6,7
ORCHESTRATOR_WORKER_1_PARTITIONS=8,9,10,11,12,13,14,15
GATEWAY_HTTP_PORT=8182
EOF
chmod 600 "${ENV_FILE}"

compose() {
  "${COMPOSE[@]}" --project-name "${COMPOSE_PROJECT}" --env-file "${ENV_FILE}" \
    -f "${BASE_COMPOSE_FILE}" -f "${CANARY_COMPOSE_FILE}" "$@"
}

registry_retry_command "ghcr-login" bash -c 'printf "%s" "${GHCR_PAT}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin'
registry_retry_command "canary-pull" compose pull \
  web hosted-sites hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
compose up -d --remove-orphans

ready=false
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:3182/api/health" >/dev/null \
    && curl -fsS "http://127.0.0.1:8182/health" >/dev/null \
    && curl -fsS "http://127.0.0.1:8182/orchestrator" >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "${ready}" != "true" ]]; then
  compose ps -a
  compose logs --tail=160
  exit 1
fi

compose ps
echo "Cutover canary passed health checks: project=${COMPOSE_PROJECT} image_tag=${IMAGE_TAG} web_port=3182 gateway_port=8182."
