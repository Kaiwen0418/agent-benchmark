#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/deploy-hosted-sites.yml"
DEPLOY_SCRIPT="${ROOT_DIR}/infra/scripts/deploy-cutover-canary.sh"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.canary.yml"

require_text() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "${expected}" "${file}"; then
    printf 'expected %s to contain: %s\n' "${file}" "${expected}" >&2
    exit 1
  fi
}

bash -n "${DEPLOY_SCRIPT}"
require_text "${WORKFLOW}" "deployment_mode: \${{ steps.environment.outputs.deployment_mode }}"
require_text "${WORKFLOW}" "if: needs.validate-ref.outputs.deployment_mode == 'canary'"
require_text "${WORKFLOW}" "CANARY_ACTION: destroy"
require_text "${WORKFLOW}" "DATABASE_CANARY_URL"
require_text "${WORKFLOW}" "DATABASE_DIRECT_URL=\"\${DATABASE_CANARY_DIRECT_URL}\""
require_text "${DEPLOY_SCRIPT}" 'COMPOSE_PROJECT="agentbench-cutover-canary"'
require_text "${DEPLOY_SCRIPT}" 'down --volumes --remove-orphans'
require_text "${DEPLOY_SCRIPT}" '"${database_name}" != *_candidate'
require_text "${DEPLOY_SCRIPT}" '^[0-9a-f]{12}$'
require_text "${COMPOSE_FILE}" '"3182:3000"'
require_text "${COMPOSE_FILE}" 'AGENTBENCH_WEB_URL: http://web:3000'

set +e
canonical_output="$({
  CANARY_HOST=canary.invalid \
    DATABASE_URL=postgresql://test:test@db.invalid:5432/agentbench_development \
    GHCR_PAT=test-only \
    GHCR_USERNAME=test-only \
    GITHUB_REPOSITORY_OWNER=test-only \
    IMAGE_TAG=0123456789ab \
    RUNNER_SHARED_SECRET=test-only \
    bash "${DEPLOY_SCRIPT}"
} 2>&1)"
canonical_status=$?

mutable_tag_output="$({
  CANARY_HOST=canary.invalid \
    DATABASE_URL=postgresql://test:test@db.invalid:5432/agentbench_development_candidate \
    GHCR_PAT=test-only \
    GHCR_USERNAME=test-only \
    GITHUB_REPOSITORY_OWNER=test-only \
    IMAGE_TAG=latest-develop \
    RUNNER_SHARED_SECRET=test-only \
    bash "${DEPLOY_SCRIPT}"
} 2>&1)"
mutable_tag_status=$?
set -e

if [[ "${canonical_status}" -eq 0 || "${canonical_output}" != *"ending in _candidate"* ]]; then
  echo "Canary deployment did not reject the canonical database." >&2
  exit 1
fi

if [[ "${mutable_tag_status}" -eq 0 || "${mutable_tag_output}" != *"immutable 12-character commit tag"* ]]; then
  echo "Canary deployment did not reject a mutable image tag." >&2
  exit 1
fi

echo "Cutover canary contract tests passed"
