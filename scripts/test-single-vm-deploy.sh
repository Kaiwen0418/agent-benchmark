#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy="${ROOT_DIR}/infra/scripts/deploy-single-vm-development.sh"
implementation="${ROOT_DIR}/infra/scripts/deploy-single-vm.sh"
production_deploy="${ROOT_DIR}/infra/scripts/deploy-single-vm-production.sh"
smoke="${ROOT_DIR}/infra/scripts/smoke-single-vm-development.sh"
runner_access="${ROOT_DIR}/infra/scripts/configure-development-runner-access.sh"
database_init="${ROOT_DIR}/infra/scripts/initialize-single-vm-database.sh"
workflow="${ROOT_DIR}/.github/workflows/deploy-hosted-sites.yml"
bash -n "${deploy}"
bash -n "${implementation}"
bash -n "${production_deploy}"
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
grep -Fq 'agentbench-local-development' "${implementation}" || {
  echo "Deploy script does not pin the development Compose project." >&2
  exit 1
}
grep -Fq 'mktemp "${RUNNER_TEMP:-/tmp}/agentbench-development-env-backup.XXXXXX"' "${implementation}" || {
  echo "Deploy script must not create rollback files in the protected secrets directory." >&2
  exit 1
}
grep -Fq 'cat "${backup}" > "${env_file}"' "${implementation}" || {
  echo "Deploy rollback must restore content without changing protected file metadata." >&2
  exit 1
}
if grep -Fq 'cp -p' "${implementation}"; then
  echo "Deploy backup must not try to preserve root-owned environment file metadata." >&2
  exit 1
fi
if grep -Fq 'pull_services=(web hosted-sites' "${implementation}"; then
  echo "Topology-only deploys must not pull unchanged application images." >&2
  exit 1
fi
for expected in \
  'wait_for_http()' \
  'curl --fail --silent --show-error --max-time 5' \
  'wait_for_http hosted-orchestrator "http://127.0.0.1:${gateway_port}/orchestrator/health"'; do
  grep -Fq "${expected}" "${implementation}" || {
    echo "Deploy readiness checks are missing ${expected}." >&2
    exit 1
  }
done

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

fake_bin="${temporary}/bin"
mkdir -p "${fake_bin}"
cat > "${fake_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == login ]]; then
  cat >/dev/null
fi
for argument in "$@"; do
  if [[ "${argument}" == pull ]]; then
    printf '%s\n' "${AGENTBENCH_WEB_IMAGE_TAG:-unset}" >> "${FAKE_DOCKER_LOG}"
    break
  fi
done
exit 0
EOF
cat > "${fake_bin}/curl" <<'EOF'
#!/usr/bin/env bash
[[ "${FAKE_CURL_FAIL:-false}" != true ]] || exit 1
[[ -z "${FAKE_CURL_LOG:-}" ]] || printf '%s\n' "$*" >> "$FAKE_CURL_LOG"
exit 0
EOF
cat > "${fake_bin}/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${fake_bin}/docker" "${fake_bin}/curl" "${fake_bin}/sleep"

development_env="${temporary}/development.env"
fake_docker_log="${temporary}/docker.log"
bash "${ROOT_DIR}/infra/scripts/init-single-vm-env.sh" "${development_env}" \
  https://web-dev.example.test https://hosted-dev.example.test development >/dev/null
printf '\nIMAGE_TAG=stale-persisted-tag\nWEB_CHANGED=false\n' >> "${development_env}"
deployment_tag=0123456789ab
output="$({
  PATH="${fake_bin}:${PATH}" FAKE_DOCKER_LOG="${fake_docker_log}" \
  GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test IMAGE_TAG="${deployment_tag}" \
  WEB_CHANGED=true HOSTED_SITES_CHANGED=false ORCHESTRATOR_CHANGED=false \
    bash "${deploy}" "${development_env}"
} 2>&1)"
[[ "${output}" == *"image tag ${deployment_tag}"* ]] || {
  echo "Protected environment variables overrode workflow deployment inputs." >&2
  exit 1
}
grep -Fq "AGENTBENCH_WEB_IMAGE_TAG=${deployment_tag}" "${development_env}" || {
  echo "Single-VM deploy did not persist the workflow image tag." >&2
  exit 1
}
[[ "$(cat "${fake_docker_log}")" == "${deployment_tag}" ]] || {
  echo "Docker Compose did not receive the workflow image tag." >&2
  exit 1
}

production_env="${temporary}/production.env"
production_log="${temporary}/production-docker.log"
curl_log="${temporary}/curl.log"
PATH="${fake_bin}:${PATH}" FAKE_DOCKER_LOG="${production_log}" FAKE_CURL_LOG="${curl_log}" \
  GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test IMAGE_TAG="${deployment_tag}" \
  WEB_CHANGED=true bash "${production_deploy}" "${production_env}" >/dev/null
grep -Fq '127.0.0.1:3000/api/health' "${curl_log}"
grep -Fq '127.0.0.1:8080/orchestrator/health' "${curl_log}"
[[ "$(cat "${production_log}")" == "${deployment_tag}" ]]
before="$(sha256sum "${production_env}" | cut -d' ' -f1)"
set +e
PATH="${fake_bin}:${PATH}" FAKE_DOCKER_LOG="${production_log}" FAKE_CURL_FAIL=true \
  GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test IMAGE_TAG=111111111111 \
  WEB_CHANGED=true bash "${production_deploy}" "${production_env}" >/dev/null 2>&1
status=$?
set -e
[[ "${status}" -ne 0 && "$(sha256sum "${production_env}" | cut -d' ' -f1)" == "${before}" ]] || {
  echo 'Production readiness failure did not restore the environment file.' >&2; exit 1;
}
set +e
PATH="${fake_bin}:${PATH}" GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test \
  IMAGE_TAG="${deployment_tag}" bash "${production_deploy}" "${development_env}" >/dev/null 2>&1
status=$?
set -e
[[ "${status}" -ne 0 ]] || { echo 'Production accepted development configuration.' >&2; exit 1; }
printf '\nPRODUCTION_DATABASE_POOL_PORT=65433\n' >> "${production_env}"
set +e
output="$({
  PATH="${fake_bin}:${PATH}" GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test \
    IMAGE_TAG="${deployment_tag}" bash "${production_deploy}" "${production_env}"
} 2>&1)"
status=$?
set -e
[[ "${status}" -ne 0 && "${output}" == *'Invalid single-VM database or listener isolation'* ]] || {
  echo 'Production accepted a development database listener.' >&2; exit 1;
}

production_jobs="$(sed -n '/^  migrate-production:/,/^  deploy-development:/p; /^  deploy-production:/,$p' "${workflow}")"
for expected in \
  "PRODUCTION_DEPLOYMENT_MODE || 'legacy'" \
  "if: vars.PRODUCTION_DEPLOYMENT_MODE == 'single-vm'" \
  "if: vars.PRODUCTION_DEPLOYMENT_MODE != 'single-vm'" \
  'initialize-single-vm-database.sh "${SINGLE_VM_ENV_FILE}" production' \
  'deploy-single-vm-production.sh "${SINGLE_VM_ENV_FILE}"' \
  "needs.build-web.result == 'success'"; do
  grep -Fq "${expected}" <<< "${production_jobs}" || {
    echo "Production workflow is missing ${expected}." >&2; exit 1;
  }
done

echo "Single-VM deployment workflow tests passed."
