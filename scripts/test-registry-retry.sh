#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../infra/scripts/registry-retry.sh
source "${ROOT_DIR}/infra/scripts/registry-retry.sh"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

write_log() {
  local name="$1"
  local content="$2"
  printf '%s\n' "${content}" > "${tmp_dir}/${name}.log"
  registry_failure_classification "${tmp_dir}/${name}.log"
}

[[ "$(write_log timeout 'net/http: TLS handshake timeout')" == "registry-transient" ]]
[[ "$(write_log auth 'denied: permission_denied')" == "registry-auth" ]]
[[ "$(write_log manifest 'manifest unknown')" == "registry-missing-image" ]]

flaky_count=0
flaky_command() {
  flaky_count=$((flaky_count + 1))
  if [[ "${flaky_count}" -lt 3 ]]; then
    echo "Get https://ghcr.io/v2/: net/http: TLS handshake timeout" >&2
    return 1
  fi
  return 0
}

REGISTRY_RETRY_ATTEMPTS=4 REGISTRY_RETRY_BASE_DELAY_SECONDS=0 registry_retry_command "flaky" flaky_command >/dev/null
[[ "${flaky_count}" -eq 3 ]]

auth_count=0
auth_command() {
  auth_count=$((auth_count + 1))
  echo "denied: permission_denied" >&2
  return 1
}

if REGISTRY_RETRY_ATTEMPTS=4 REGISTRY_RETRY_BASE_DELAY_SECONDS=0 registry_retry_command "auth" auth_command >/dev/null 2>&1; then
  echo "non-retryable auth failure unexpectedly succeeded" >&2
  exit 1
fi
[[ "${auth_count}" -eq 1 ]]

exhaust_count=0
exhaust_command() {
  exhaust_count=$((exhaust_count + 1))
  echo "connection reset by peer" >&2
  return 1
}

if REGISTRY_RETRY_ATTEMPTS=3 REGISTRY_RETRY_BASE_DELAY_SECONDS=0 registry_retry_command "exhaust" exhaust_command >/dev/null 2>&1; then
  echo "retry exhaustion unexpectedly succeeded" >&2
  exit 1
fi
[[ "${exhaust_count}" -eq 3 ]]

echo "registry retry tests passed"
