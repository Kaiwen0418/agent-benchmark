#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy="${ROOT_DIR}/infra/scripts/deploy-single-vm-development.sh"
smoke="${ROOT_DIR}/infra/scripts/smoke-single-vm-development.sh"
workflow="${ROOT_DIR}/.github/workflows/deploy-hosted-sites.yml"
bash -n "${deploy}"
bash -n "${smoke}"

for expected in \
  'SINGLE_VM_ENV_FILE' \
  'deploy-single-vm-development.sh' \
  'smoke-single-vm-development.sh'; do
  grep -Fq "${expected}" "${workflow}" || { echo "Workflow is missing ${expected}." >&2; exit 1; }
done
grep -Fq 'agentbench-local-development' "${deploy}" || {
  echo "Deploy script does not pin the development Compose project." >&2
  exit 1
}

temporary="$(mktemp -d)"
trap 'rm -rf "${temporary}"' EXIT
bash "${ROOT_DIR}/infra/scripts/init-single-vm-env.sh" "${temporary}/production.env" \
  https://web.example.test https://hosted.example.test >/dev/null
set +e
output="$({
  GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test IMAGE_TAG=0123456789ab \
    bash "${deploy}" "${temporary}/production.env"
} 2>&1)"
status=$?
set -e
[[ "${status}" -ne 0 && "${output}" == *"non-development"* ]] || {
  echo "Single-VM deploy did not reject a production environment." >&2
  exit 1
}

echo "Single-VM deployment workflow tests passed."
