#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if rg --files apps packages | rg '(^|/)(src|lib|app)/.*\.test\.(ts|tsx|js)$'; then
  echo "Tests must live under workspace tests/ directories, not production source directories." >&2
  exit 1
fi

for workspace in apps/* packages/*; do
  [[ -f "${workspace}/package.json" ]] || continue
  if [[ ! -d "${workspace}/tests/unit" ]]; then
    echo "Missing unit test directory: ${workspace}/tests/unit" >&2
    exit 1
  fi
done

echo "test layout checks passed"
