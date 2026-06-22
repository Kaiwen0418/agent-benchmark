#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if rg -n '@supabase|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY' apps/hosted-sites; then
  echo "hosted-sites must not import Supabase or receive database credentials." >&2
  exit 1
fi

if rg -n 'benchmark_attempts|hosted_web_sessions|hosted_web_results|hosted_web_events|benchmark_attempt_scores|hosted_callback_outbox' \
  apps/web/lib apps/web/app --glob '!**/*.test.ts'; then
  echo "Web must consume hosted lifecycle data through orchestrator APIs or public read models." >&2
  exit 1
fi

echo "database ownership checks passed"
