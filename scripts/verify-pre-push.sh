#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ "${SKIP_PRE_PUSH_VERIFY:-0}" == "1" ]]; then
  echo "pre-push verification skipped by SKIP_PRE_PUSH_VERIFY=1"
  exit 0
fi

pnpm verify:ci
