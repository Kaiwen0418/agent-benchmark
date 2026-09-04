#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/deploy-hosted-sites.yml"
DEPLOY_SCRIPT="${ROOT_DIR}/infra/scripts/deploy-web-stack.sh"

require_text() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "${expected}" "${file}"; then
    printf 'expected %s to contain: %s\n' "${file}" "${expected}" >&2
    exit 1
  fi
}

bash -n "${DEPLOY_SCRIPT}"
require_text "${WORKFLOW}" "web: \${{ steps.changes.outputs.web }}"
require_text "${WORKFLOW}" "if: needs.detect-changes.outputs.web == 'true'"
require_text "${WORKFLOW}" "file: infra/docker/web.Dockerfile"
require_text "${DEPLOY_SCRIPT}" "static_asset_path="
require_text "${DEPLOY_SCRIPT}" "Web home page does not reference a Next.js static asset."
require_text "${WORKFLOW}" "WEB_COMPOSE_PROJECT_NAME: agentbench-development-web"
require_text "${WORKFLOW}" 'AGENTBENCH_WEB_URL: ${{ vars.AGENTBENCH_WEB_URL }}'
require_text "${WORKFLOW}" "RUN_CREATION_MODE: \${{ vars.RUN_CREATION_MODE || 'open' }}"
require_text "${WORKFLOW}" "run: bash infra/scripts/deploy-web-stack.sh"
require_text "${DEPLOY_SCRIPT}" 'COMPOSE_FILE="infra/docker/docker-compose.web.yml"'
require_text "${DEPLOY_SCRIPT}" 'AGENTBENCH_WEB_URL=${AGENTBENCH_WEB_URL}'
require_text "${ROOT_DIR}/infra/docker/docker-compose.web.yml" 'AUTH_URL: ${AGENTBENCH_WEB_URL}'
require_text "${DEPLOY_SCRIPT}" 'compose up -d --remove-orphans --no-deps web'

set +e
invalid_output="$({
  AGENTBENCH_WEB_URL=https://web.invalid \
  AGENTBENCH_WEB_PORT=3000 \
    DATABASE_URL=postgresql://test-only \
    DEPLOYMENT_ENVIRONMENT=production \
    GHCR_PAT=test-only \
    GHCR_USERNAME=test-only \
    GITHUB_REPOSITORY_OWNER=test-only \
    HOSTED_ORCHESTRATOR_URL=http://orchestrator.invalid \
    HOSTED_SITES_URL=http://sites.invalid \
    IMAGE_CHANNEL=develop \
    IMAGE_TAG=test-only \
    RUNNER_SHARED_SECRET=test-only \
    WEB_COMPOSE_PROJECT_NAME=agentbench-development-web \
    bash "${DEPLOY_SCRIPT}"
} 2>&1)"
invalid_status=$?
set -e

if [[ "${invalid_status}" -eq 0 || "${invalid_output}" != *"Invalid Web deployment mapping"* ]]; then
  echo "Web deployment script did not reject a mixed environment mapping." >&2
  exit 1
fi

set +e
freeze_output="$({
  AGENTBENCH_WEB_URL=https://web.invalid \
  AGENTBENCH_WEB_PORT=3000 \
    DATABASE_URL=postgresql://test-only \
    DEPLOYMENT_ENVIRONMENT=development \
    GHCR_PAT=test-only \
    GHCR_USERNAME=test-only \
    GITHUB_REPOSITORY_OWNER=test-only \
    HOSTED_ORCHESTRATOR_URL=http://orchestrator.invalid \
    HOSTED_SITES_URL=http://sites.invalid \
    IMAGE_CHANNEL=develop \
    IMAGE_TAG=test-only \
    RUN_CREATION_MODE=invalid \
    RUNNER_SHARED_SECRET=test-only \
    WEB_COMPOSE_PROJECT_NAME=agentbench-development-web \
    bash "${DEPLOY_SCRIPT}"
} 2>&1)"
freeze_status=$?
set -e

if [[ "${freeze_status}" -eq 0 || "${freeze_output}" != *"RUN_CREATION_MODE must be open or frozen"* ]]; then
  echo "Web deployment script did not reject an invalid run-creation mode." >&2
  exit 1
fi

echo "Web deployment workflow tests passed"
