#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/model-catalog-sync.yml"

grep -Eq 'pnpm --filter @agentbench/model-catalog-sync sync' "${WORKFLOW}"
grep -Eq 'SUPABASE_URL:.*vars\.SUPABASE_URL' "${WORKFLOW}"
grep -Eq 'SUPABASE_SERVICE_ROLE_KEY:.*secrets\.SUPABASE_SERVICE_ROLE_KEY' "${WORKFLOW}"
grep -Eq 'max-parallel: 1' "${WORKFLOW}"

if grep -Eq 'AGENTBENCH_WEB_URL|MODEL_CATALOG_SYNC_SECRET|curl .*model-catalog' "${WORKFLOW}"; then
  echo "model catalog workflow must write directly to Supabase without a Web callback" >&2
  exit 1
fi

if find "${ROOT_DIR}/apps/web/app/api" -type f -print |
  grep -Eq '/internal/model-catalog/sync/'; then
  echo "Web model catalog synchronization route must not exist" >&2
  exit 1
fi

echo "model catalog sync workflow tests passed"
