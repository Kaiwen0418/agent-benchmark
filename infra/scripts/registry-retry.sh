#!/usr/bin/env bash

registry_failure_classification() {
  local log_file="$1"
  local content
  content="$(tr '[:upper:]' '[:lower:]' < "${log_file}" 2>/dev/null || true)"

  if grep -Eq 'unauthorized|authentication required|denied:|permission_denied|invalid username|incorrect username|forbidden' <<< "${content}"; then
    printf 'registry-auth'
    return
  fi

  if grep -Eq 'manifest unknown|not found|name unknown|repository does not exist|pull access denied' <<< "${content}"; then
    printf 'registry-missing-image'
    return
  fi

  if grep -Eq 'timeout|timed out|i/o timeout|tls handshake timeout|connection reset|connection refused|temporary failure|server misbehaving|no such host|service unavailable|too many requests|429|500|502|503|504|unexpected eof|net/http' <<< "${content}"; then
    printf 'registry-transient'
    return
  fi

  printf 'registry-unknown'
}

registry_retry_command() {
  local label="$1"
  local attempts="${REGISTRY_RETRY_ATTEMPTS:-4}"
  local base_delay="${REGISTRY_RETRY_BASE_DELAY_SECONDS:-2}"
  shift

  local start_epoch
  start_epoch="$(date +%s)"
  local attempt
  local log_file
  log_file="$(mktemp "${RUNNER_TEMP:-/tmp}/agentbench-registry-${label//[^A-Za-z0-9_.-]/_}.XXXXXX")"

  for attempt in $(seq 1 "${attempts}"); do
    : > "${log_file}"
    echo "registry step '${label}' attempt ${attempt}/${attempts}"
    if "$@" >"${log_file}" 2>&1; then
      local elapsed
      elapsed="$(( $(date +%s) - start_epoch ))"
      echo "registry step '${label}' succeeded after ${attempt}/${attempts} attempt(s), elapsed=${elapsed}s"
      rm -f "${log_file}"
      return 0
    fi

    local classification
    classification="$(registry_failure_classification "${log_file}")"
    echo "registry step '${label}' failed attempt ${attempt}/${attempts}: classification=${classification}" >&2

    case "${classification}" in
      registry-auth | registry-missing-image)
        echo "registry step '${label}' is not retryable; failing promptly." >&2
        sed -n '1,80p' "${log_file}" >&2 || true
        rm -f "${log_file}"
        return 1
        ;;
    esac

    if [[ "${attempt}" -ge "${attempts}" ]]; then
      local elapsed
      elapsed="$(( $(date +%s) - start_epoch ))"
      echo "registry step '${label}' exhausted retry budget: classification=${classification}, attempts=${attempts}, elapsed=${elapsed}s" >&2
      sed -n '1,120p' "${log_file}" >&2 || true
      rm -f "${log_file}"
      return 1
    fi

    sleep "$(( base_delay * 2 ** (attempt - 1) ))"
  done
}
