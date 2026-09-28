#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Specify the protected development environment file}"
required_variables=(GITHUB_REPOSITORY_OWNER GHCR_TOKEN GHCR_USERNAME IMAGE_TAG)
for variable in "${required_variables[@]}"; do
  [[ -n "${!variable:-}" ]] || { echo "Required deployment variable ${variable} is not set." >&2; exit 1; }
done
[[ -r "${env_file}" ]] || { echo "Development environment file is not readable." >&2; exit 1; }
[[ "${IMAGE_TAG}" =~ ^[0-9a-f]{12}$ ]] || { echo "IMAGE_TAG must be a 12-character commit tag." >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
[[ "${SINGLE_VM_ENVIRONMENT:-}" == development && "${SINGLE_VM_PROJECT:-}" == agentbench-local-development ]] || {
  echo "Refusing to deploy a non-development single-VM environment." >&2
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

WEB_CHANGED="${WEB_CHANGED:-false}"
HOSTED_SITES_CHANGED="${HOSTED_SITES_CHANGED:-false}"
ORCHESTRATOR_CHANGED="${ORCHESTRATOR_CHANGED:-false}"
INFRA_CHANGED="${INFRA_CHANGED:-false}"
TOPOLOGY_CHANGED="${TOPOLOGY_CHANGED:-false}"
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

rollback() {
  local status=$?
  trap - ERR
  if [[ "${rollback_required}" == true ]]; then
    cat "${backup}" > "${env_file}"
    compose up -d --no-deps --force-recreate web hosted-sites \
      hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1 gateway || true
  fi
  rm -f "${backup}"
  echo "Development deployment failed; previous image tags were restored." >&2
  exit "${status}"
}
trap rollback ERR

owner="$(printf '%s' "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')"
set_env_key AGENTBENCH_WEB_IMAGE "ghcr.io/${owner}/agentbench-web"
set_env_key HOSTED_SITES_IMAGE "ghcr.io/${owner}/agentbench-hosted-sites"
set_env_key HOSTED_ORCHESTRATOR_IMAGE "ghcr.io/${owner}/agentbench-hosted-orchestrator"
[[ "${WEB_CHANGED}" == false ]] || set_env_key AGENTBENCH_WEB_IMAGE_TAG "${IMAGE_TAG}"
[[ "${HOSTED_SITES_CHANGED}" == false ]] || set_env_key HOSTED_SITES_IMAGE_TAG "${IMAGE_TAG}"
[[ "${ORCHESTRATOR_CHANGED}" == false ]] || set_env_key HOSTED_ORCHESTRATOR_IMAGE_TAG "${IMAGE_TAG}"
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

curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
curl --fail --silent --show-error http://127.0.0.1:8081/health >/dev/null
curl --fail --silent --show-error http://127.0.0.1:8081/orchestrator/health >/dev/null

rollback_required=false
trap - ERR
rm -f "${backup}"
compose ps
echo "Development single-VM deployment passed for image tag ${IMAGE_TAG}."
