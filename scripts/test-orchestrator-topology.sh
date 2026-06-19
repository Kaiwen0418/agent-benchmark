#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="${ROOT_DIR}/infra/scripts/validate-orchestrator-partitions.sh"

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
