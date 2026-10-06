#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Specify the protected runtime environment file}"
deployment_environment="${2:?Specify development or production}"
case "${deployment_environment}" in
  development) project=agentbench-local-development; web_port=3001; gateway_port=8081; database=agentbench_development; direct_port=55433; pool_port=65433 ;;
  production) project=agentbench-single-vm; web_port=3000; gateway_port=8080; database=agentbench_production; direct_port=55432; pool_port=65432 ;;
  *) echo 'Expected development or production.' >&2; exit 1 ;;
esac
readonly deployment_environment project web_port gateway_port database direct_port pool_port
required_variables=(GITHUB_REPOSITORY_OWNER GHCR_TOKEN GHCR_USERNAME IMAGE_TAG)
for variable in "${required_variables[@]}"; do
  [[ -n "${!variable:-}" ]] || { echo "Required deployment variable ${variable} is not set." >&2; exit 1; }
done
[[ -r "${env_file}" ]] || { echo "Runtime environment file is not readable." >&2; exit 1; }

# The protected file owns service configuration, while the workflow owns the
# immutable release inputs for this deployment. Preserve that precedence even
# if an older environment file contains stale copies of workflow variables.
deployment_repository_owner="${GITHUB_REPOSITORY_OWNER}"
deployment_ghcr_token="${GHCR_TOKEN}"
deployment_ghcr_username="${GHCR_USERNAME}"
deployment_image_tag="${IMAGE_TAG}"
deployment_web_changed="${WEB_CHANGED:-false}"
deployment_hosted_sites_changed="${HOSTED_SITES_CHANGED:-false}"
deployment_orchestrator_changed="${ORCHESTRATOR_CHANGED:-false}"
deployment_infra_changed="${INFRA_CHANGED:-false}"
deployment_topology_changed="${TOPOLOGY_CHANGED:-false}"

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
GITHUB_REPOSITORY_OWNER="${deployment_repository_owner}"
GHCR_TOKEN="${deployment_ghcr_token}"
GHCR_USERNAME="${deployment_ghcr_username}"
IMAGE_TAG="${deployment_image_tag}"
WEB_CHANGED="${deployment_web_changed}"
HOSTED_SITES_CHANGED="${deployment_hosted_sites_changed}"
ORCHESTRATOR_CHANGED="${deployment_orchestrator_changed}"
INFRA_CHANGED="${deployment_infra_changed}"
TOPOLOGY_CHANGED="${deployment_topology_changed}"

[[ "${IMAGE_TAG}" =~ ^[0-9a-f]{12}$ ]] || { echo "IMAGE_TAG must be a 12-character commit tag." >&2; exit 1; }
[[ "${SINGLE_VM_ENVIRONMENT:-}" == "${deployment_environment}" && "${SINGLE_VM_PROJECT:-}" == "${project}" ]] || {
  echo "Refusing to deploy a non-${deployment_environment} single-VM environment." >&2
  exit 1
}
[[ "${SINGLE_VM_DATABASE_NAME:-}" == "${database}" &&
   "${PRODUCTION_DATABASE_DIRECT_PORT:-}" == "${direct_port}" &&
   "${PRODUCTION_DATABASE_POOL_PORT:-}" == "${pool_port}" &&
   "${AGENTBENCH_WEB_PORT:-}" == "127.0.0.1:${web_port}" &&
   "${GATEWAY_HTTP_PORT:-}" == "127.0.0.1:${gateway_port}" &&
   "${DATABASE_URL:-}" == postgresql://*@pgbouncer:5432/"${database}" ]] || {
  echo "Invalid single-VM database or listener isolation." >&2
  exit 1
}

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose is required on the development runner." >&2
  exit 127
fi

compose_file="${ROOT_DIR}/infra/docker/docker-compose.single-vm.yml"
compose() {
  "${COMPOSE[@]}" --env-file "${env_file}" -f "${compose_file}" "$@"
}

wait_for_http() {
  local name="$1" url="$2" attempts="${3:-15}" delay_seconds="${4:-2}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 5 "${url}" >/dev/null; then
      return 0
    fi
    if ((attempt < attempts)); then
      echo "Waiting for ${name} readiness (${attempt}/${attempts})..." >&2
      sleep "${delay_seconds}"
    fi
  done
  echo "${name} did not become ready after ${attempts} attempts." >&2
  return 1
}

for flag in WEB_CHANGED HOSTED_SITES_CHANGED ORCHESTRATOR_CHANGED INFRA_CHANGED TOPOLOGY_CHANGED; do
  [[ "${!flag}" == true || "${!flag}" == false ]] || { echo "${flag} must be true or false." >&2; exit 1; }
done

backup="$(mktemp "${RUNNER_TEMP:-/tmp}/agentbench-development-env-backup.XXXXXX")"
cat "${env_file}" > "${backup}"
chmod 0600 "${backup}"
rollback_required=false

set_env_key() {
  local key="$1" value="$2" temporary
  temporary="$(mktemp "${RUNNER_TEMP:-/tmp}/agentbench-development-env.XXXXXX")"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "${env_file}" > "${temporary}"
  cat "${temporary}" > "${env_file}"
  rm -f "${temporary}"
}

set_compose_env_key() {
  local key="$1" value="$2"
  set_env_key "${key}" "${value}"
  printf -v "${key}" '%s' "${value}"
  export "${key}"
}

rollback() {
  local status=$?
  trap - ERR
  if [[ "${rollback_required}" == true ]]; then
    cat "${backup}" > "${env_file}"
    compose up -d --no-deps --force-recreate web hosted-sites \
      hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1 gateway || true
  fi
  rm -f "${backup}"
  echo "${deployment_environment} deployment failed; previous image tags were restored." >&2
  exit "${status}"
}
trap rollback ERR

owner="$(printf '%s' "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')"
set_compose_env_key AGENTBENCH_WEB_IMAGE "ghcr.io/${owner}/agentbench-web"
set_compose_env_key HOSTED_SITES_IMAGE "ghcr.io/${owner}/agentbench-hosted-sites"
set_compose_env_key HOSTED_ORCHESTRATOR_IMAGE "ghcr.io/${owner}/agentbench-hosted-orchestrator"
[[ "${WEB_CHANGED}" == false ]] || set_compose_env_key AGENTBENCH_WEB_IMAGE_TAG "${IMAGE_TAG}"
[[ "${HOSTED_SITES_CHANGED}" == false ]] || set_compose_env_key HOSTED_SITES_IMAGE_TAG "${IMAGE_TAG}"
[[ "${ORCHESTRATOR_CHANGED}" == false ]] || set_compose_env_key HOSTED_ORCHESTRATOR_IMAGE_TAG "${IMAGE_TAG}"
rollback_required=true

# shellcheck source=registry-retry.sh
source "${ROOT_DIR}/infra/scripts/registry-retry.sh"
registry_retry_command ghcr-login bash -c 'printf "%s" "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin'

pull_services=()
[[ "${WEB_CHANGED}" == false ]] || pull_services+=(web)
[[ "${HOSTED_SITES_CHANGED}" == false ]] || pull_services+=(hosted-sites)
if [[ "${ORCHESTRATOR_CHANGED}" == true ]]; then
  pull_services+=(hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1)
fi
if [[ "${INFRA_CHANGED}" == true || "${TOPOLOGY_CHANGED}" == true ]]; then
  pull_services+=(session-redis orchestrator-redis gateway postgres pgbouncer)
fi
[[ "${#pull_services[@]}" -eq 0 ]] || registry_retry_command compose-pull compose pull "${pull_services[@]}"

if [[ "${INFRA_CHANGED}" == true || "${TOPOLOGY_CHANGED}" == true ]]; then
  compose up -d --remove-orphans --wait
else
  [[ "${WEB_CHANGED}" == false ]] || compose up -d --no-deps --wait web
  if [[ "${HOSTED_SITES_CHANGED}" == true ]]; then
    compose up -d --no-deps --wait hosted-sites
    compose up -d --no-deps --force-recreate gateway
  fi
  if [[ "${ORCHESTRATOR_CHANGED}" == true ]]; then
    compose up -d --no-deps --wait hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
    compose up -d --no-deps --force-recreate gateway
  fi
fi

wait_for_http web "http://127.0.0.1:${web_port}/api/health"
wait_for_http hosted-sites "http://127.0.0.1:${gateway_port}/health"
wait_for_http hosted-orchestrator "http://127.0.0.1:${gateway_port}/orchestrator/health"

rollback_required=false
trap - ERR
rm -f "${backup}"
compose ps
echo "${deployment_environment} single-VM deployment passed for image tag ${IMAGE_TAG}."
