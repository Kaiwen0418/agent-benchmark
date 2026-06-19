#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLASSIFIER="${ROOT_DIR}/infra/scripts/classify-hosted-deploy-changes.sh"

assert_classification() {
  local files="$1"
  local expected="$2"
  local actual
  actual="$(printf '%s\n' "${files}" | bash "${CLASSIFIER}")"
  if [[ "${actual}" != "${expected}" ]]; then
    printf 'classification mismatch for:\n%s\nexpected:\n%s\nactual:\n%s\n' \
      "${files}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

assert_classification 'apps/hosted-sites/src/server.ts' $'hosted_sites=true\norchestrator=false\ninfra=false\ntopology=false'
assert_classification 'apps/hosted-orchestrator/src/server.ts' $'hosted_sites=false\norchestrator=true\ninfra=false\ntopology=false'
assert_classification 'packages/shared/src/index.ts' $'hosted_sites=true\norchestrator=true\ninfra=false\ntopology=false'
assert_classification '.github/workflows/deploy-hosted-sites.yml' $'hosted_sites=true\norchestrator=true\ninfra=false\ntopology=false'
assert_classification 'infra/nginx/hosted-sites.conf' $'hosted_sites=false\norchestrator=false\ninfra=true\ntopology=false'
assert_classification 'infra/docker/docker-compose.server.yml' $'hosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'infra/scripts/deploy-hosted-stack.sh' $'hosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'infra/scripts/validate-orchestrator-partitions.sh' $'hosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'docs/deployment.md' $'hosted_sites=false\norchestrator=false\ninfra=false\ntopology=false'

echo "deployment classifier tests passed"
