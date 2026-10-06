#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Specify the protected development environment file}"
[[ -r "${env_file}" ]] || { echo "Development environment file is not readable." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
[[ "${SINGLE_VM_ENVIRONMENT:-}" == development && "${SINGLE_VM_PROJECT:-}" == agentbench-local-development ]] || {
  echo "Refusing to smoke a non-development single-VM environment." >&2
  exit 1
}

export START_LOCAL_SERVICES=false
export DATABASE_DIRECT_URL="postgresql://${SINGLE_VM_DATABASE_USER}:${PRODUCTION_DATABASE_PASSWORD}@127.0.0.1:${PRODUCTION_DATABASE_DIRECT_PORT}/${SINGLE_VM_DATABASE_NAME}"
export AGENTBENCH_WEB_URL
export HOSTED_SITES_PUBLIC_URL
export HOSTED_ORCHESTRATOR_PUBLIC_URL
export RUNNER_SHARED_SECRET

cd "${ROOT_DIR}"
bash tests/e2e/hosted-lifecycle-full-pass.sh
