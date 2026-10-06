#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/model-catalog-sync.yml"

grep -Fq 'python3 scripts/lib/exec-model-catalog-sync.py' "${WORKFLOW}"
grep -Fq 'SINGLE_VM_ENV_FILE: ${{ vars.SINGLE_VM_ENV_FILE }}' "${WORKFLOW}"
grep -Fq "'agentbench-prod' || 'agentbench-dev'" "${WORKFLOW}"
grep -Fq "github.ref_name == 'develop' || github.ref_name == 'main'" "${WORKFLOW}"
grep -Fq 'for source in openrouter litellm openai anthropic google xai kimi deepseek; do' "${WORKFLOW}"
if grep -Eq 'secrets\.(DATABASE|PROD_SUPABASE|TEST_SUPABASE)|matrix\.source' "${WORKFLOW}"; then
  echo 'Private maintenance must not use hosted-runner database secrets or per-source approval jobs.' >&2
  exit 1
fi
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "${ROOT_DIR}/packages/model-catalog-sync/tests/unit" -p 'test_*.py'

if grep -Eq 'SUPABASE_URL:|SUPABASE_SERVICE_ROLE_KEY:|AGENTBENCH_WEB_URL|MODEL_CATALOG_SYNC_SECRET|curl .*model-catalog' "${WORKFLOW}"; then
  echo "model catalog workflow must write directly to PostgreSQL without Supabase REST or a Web callback" >&2
  exit 1
fi

if find "${ROOT_DIR}/apps/web/app/api" -type f -print |
  grep -Eq '/internal/model-catalog/sync/'; then
  echo "Web model catalog synchronization route must not exist" >&2
  exit 1
fi

echo "model catalog sync workflow tests passed"
