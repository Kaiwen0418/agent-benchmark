#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy="${ROOT_DIR}/infra/scripts/deploy-single-vm-development.sh"
smoke="${ROOT_DIR}/infra/scripts/smoke-single-vm-development.sh"
runner_access="${ROOT_DIR}/infra/scripts/configure-development-runner-access.sh"
database_init="${ROOT_DIR}/infra/scripts/initialize-single-vm-database.sh"
workflow="${ROOT_DIR}/.github/workflows/deploy-hosted-sites.yml"
bash -n "${deploy}"
bash -n "${smoke}"
bash -n "${runner_access}"
bash -n "${database_init}"

for expected in \
  'chmod 0710 "${current}"' \
  'chmod 0660 "${env_file}"' \
  'usermod --append --groups docker,"${runner_group}"'; do
  grep -Fq "${expected}" "${runner_access}" || {
    echo "Runner access script is missing ${expected}." >&2
    exit 1
  }
done

for expected in \
  '--user "$(id -u):$(id -g)"' \
  '-e HOME=/tmp' \
  'corepack enable --install-directory /tmp/bin' \
  'export PATH="/tmp/bin:${PATH}"' \
  '--store-dir /tmp/pnpm-store'; do
  grep -Fq -- "${expected}" "${database_init}" || {
    echo "Database initialization may leave root-owned runner files: missing ${expected}." >&2
    exit 1
  }
done

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
