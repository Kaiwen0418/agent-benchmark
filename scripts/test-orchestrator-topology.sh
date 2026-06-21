#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="${ROOT_DIR}/infra/scripts/validate-orchestrator-partitions.sh"
RECOVERY_VERIFIER="${ROOT_DIR}/infra/scripts/verify-orchestrator-worker-recovery.sh"

bash -n "${RECOVERY_VERIFIER}"

expected_plan=$'hosted-orchestrator-worker-0|0,1,2,3,4,5,6,7\nhosted-orchestrator-worker-1|8,9,10,11,12,13,14,15'
actual_plan="$(bash "${RECOVERY_VERIFIER}" --plan)"
if [[ "${actual_plan}" != "${expected_plan}" ]]; then
  echo "worker recovery plan does not match the production partition topology" >&2
  exit 1
fi

custom_plan="$(
  ORCHESTRATOR_WORKER_0_PARTITIONS='0,2' \
  ORCHESTRATOR_WORKER_1_PARTITIONS='1,3' \
    bash "${RECOVERY_VERIFIER}" --plan
)"
if [[ "${custom_plan}" != $'hosted-orchestrator-worker-0|0,2\nhosted-orchestrator-worker-1|1,3' ]]; then
  echo "worker recovery plan ignored configured partition assignments" >&2
  exit 1
fi

bash "${VALIDATOR}" 16 '0,1,2,3,4,5,6,7' '8,9,10,11,12,13,14,15' >/dev/null

if bash "${VALIDATOR}" 4 '0,1' '1,2,3' >/dev/null 2>&1; then
  echo "duplicate partition assignment was accepted" >&2
  exit 1
fi

if bash "${VALIDATOR}" 4 '0,1' '3' >/dev/null 2>&1; then
  echo "missing partition assignment was accepted" >&2
  exit 1
fi

if bash "${VALIDATOR}" 4 '0,1,2,4' >/dev/null 2>&1; then
  echo "out-of-range partition assignment was accepted" >&2
  exit 1
fi

echo "orchestrator topology tests passed"
