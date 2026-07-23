#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/model-catalog-sync.yml"

rg -q 'pnpm --filter @agentbench/model-catalog-sync sync' "${WORKFLOW}"
rg -q 'SUPABASE_URL:.*vars\.SUPABASE_URL' "${WORKFLOW}"
rg -q 'SUPABASE_SERVICE_ROLE_KEY:.*secrets\.SUPABASE_SERVICE_ROLE_KEY' "${WORKFLOW}"
rg -q 'max-parallel: 1' "${WORKFLOW}"

if rg -q 'AGENTBENCH_WEB_URL|MODEL_CATALOG_SYNC_SECRET|curl .*model-catalog' "${WORKFLOW}"; then
  echo "model catalog workflow must write directly to Supabase without a Web callback" >&2
  exit 1
fi

if rg --files "${ROOT_DIR}/apps/web/app/api" |
  rg -q '/internal/model-catalog/sync/'; then
  echo "Web model catalog synchronization route must not exist" >&2
  exit 1
fi

echo "model catalog sync workflow tests passed"
