#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_SCRIPT="${ROOT_DIR}/infra/scripts/verify-development-cutover.sh"

require_text() {
  local expected="$1"
  if ! grep -Fq -- "${expected}" "${VERIFY_SCRIPT}"; then
    printf 'expected cutover verifier to contain: %s\n' "${expected}" >&2
    exit 1
  fi
}

bash -n "${VERIFY_SCRIPT}"
require_text "status not in ('completed', 'failed', 'cancelled', 'timeout')"
require_text "status in ('pending', 'delivering')"
require_text "public.public_hosted_run_summaries"
require_text "agentbench-development-web"
require_text "agentbench:orchestrator:commands:p\${partition}"
require_text 'redis_pending}" != "0" || "${redis_lag}" != "0"'

set +e
unsafe_output="$({
  DATABASE_DIRECT_URL=postgresql://test/test \
    EXPECTED_DATABASE_NAME='test;drop' \
    bash "${VERIFY_SCRIPT}"
} 2>&1)"
unsafe_status=$?
set -e

if [[ "${unsafe_status}" -eq 0 || "${unsafe_output}" != *"unsafe characters"* ]]; then
  echo "Cutover verifier did not reject an unsafe database name." >&2
  exit 1
fi

echo "Development cutover contract tests passed"
