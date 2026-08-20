#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  AGENTBENCH_WEB_PORT
  DATABASE_URL
  DEPLOYMENT_ENVIRONMENT
  GHCR_PAT
  GHCR_USERNAME
  GITHUB_REPOSITORY_OWNER
  HOSTED_ORCHESTRATOR_URL
  HOSTED_SITES_URL
  IMAGE_CHANNEL
  IMAGE_TAG
  RUNNER_SHARED_SECRET
  WEB_COMPOSE_PROJECT_NAME
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required Web deployment variable ${variable} is not set." >&2
    exit 1
  fi
done

case "${DEPLOYMENT_ENVIRONMENT}:${WEB_COMPOSE_PROJECT_NAME}:${IMAGE_CHANNEL}" in
  development:agentbench-development-web:develop | production:agentbench-production-web:main)
    ;;
  *)
    echo "Invalid Web deployment mapping: ${DEPLOYMENT_ENVIRONMENT}:${WEB_COMPOSE_PROJECT_NAME}:${IMAGE_CHANNEL}." >&2
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

OWNER="$(printf '%s' "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')"
WEB_IMAGE="ghcr.io/${OWNER}/agentbench-web"
WEB_IMAGE_TAG="latest-${IMAGE_CHANNEL}"
if [[ "${WEB_CHANGED:-false}" == "true" ]]; then
  WEB_IMAGE_TAG="${IMAGE_TAG}"
fi

ENV_FILE="${RUNNER_TEMP:-/tmp}/agentbench-${DEPLOYMENT_ENVIRONMENT}.env.web"
COMPOSE_FILE="infra/docker/docker-compose.web.yml"
# shellcheck source=registry-retry.sh
source "infra/scripts/registry-retry.sh"

cat > "${ENV_FILE}" <<EOF
WEB_COMPOSE_PROJECT_NAME=${WEB_COMPOSE_PROJECT_NAME}
AGENTBENCH_WEB_IMAGE=${WEB_IMAGE}
AGENTBENCH_WEB_IMAGE_TAG=${WEB_IMAGE_TAG}
AGENTBENCH_WEB_PORT=${AGENTBENCH_WEB_PORT}
DATABASE_URL=${DATABASE_URL}
DATABASE_POOL_MAX=${DATABASE_POOL_MAX:-3}
GUEST_RUN_LIMIT=${GUEST_RUN_LIMIT:-3}
RUN_CONNECT_RATE_LIMIT=${RUN_CONNECT_RATE_LIMIT:-30}
HOSTED_ORCHESTRATOR_URL=${HOSTED_ORCHESTRATOR_URL}
HOSTED_SITES_URL=${HOSTED_SITES_URL}
RUNNER_SHARED_SECRET=${RUNNER_SHARED_SECRET}
EOF
chmod 600 "${ENV_FILE}"

compose() {
  "${COMPOSE[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

cleanup() {
  rm -f "${ENV_FILE}"
}
trap cleanup EXIT

registry_retry_command "ghcr-login" bash -c 'printf "%s" "${GHCR_PAT}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin'
registry_retry_command "web-pull" compose pull web
compose up -d --remove-orphans --no-deps web

ready=false
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${AGENTBENCH_WEB_PORT}/api/health" >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "${ready}" != "true" ]]; then
  compose ps -a
  compose logs --tail=160 web
  exit 1
fi

compose ps
echo "Web deployment passed: environment=${DEPLOYMENT_ENVIRONMENT} image=${WEB_IMAGE}:${WEB_IMAGE_TAG} port=${AGENTBENCH_WEB_PORT}"
