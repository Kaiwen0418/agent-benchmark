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

assert_classification 'apps/web/app/page.tsx' $'web=true\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=false'
assert_classification 'infra/docker/docker-compose.web.yml' $'web=true\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=false'
assert_classification 'apps/hosted-sites/src/server.ts' $'web=false\nhosted_sites=true\norchestrator=false\ninfra=false\ntopology=false'
assert_classification 'apps/hosted-orchestrator/src/server.ts' $'web=false\nhosted_sites=false\norchestrator=true\ninfra=false\ntopology=false'
assert_classification 'packages/database/src/client.ts' $'web=true\nhosted_sites=false\norchestrator=true\ninfra=false\ntopology=false'
assert_classification 'packages/shared/src/index.ts' $'web=true\nhosted_sites=true\norchestrator=true\ninfra=false\ntopology=false'
assert_classification '.github/workflows/deploy-hosted-sites.yml' $'web=true\nhosted_sites=true\norchestrator=true\ninfra=false\ntopology=false'
assert_classification 'infra/nginx/hosted-sites.conf' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=true\ntopology=false'
assert_classification 'infra/docker/docker-compose.server.yml' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'infra/scripts/deploy-hosted-stack.sh' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'infra/scripts/registry-retry.sh' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'infra/scripts/verify-orchestrator-worker-recovery.sh' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'infra/scripts/validate-orchestrator-partitions.sh' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=true'
assert_classification 'docs/deployment.md' $'web=false\nhosted_sites=false\norchestrator=false\ninfra=false\ntopology=false'

echo "deployment classifier tests passed"
