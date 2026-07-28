#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/hosted-variant-sweep.yml"
SMOKE="${ROOT_DIR}/tests/e2e/hosted-lifecycle-smoke.sh"

require_text() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "${expected}" "${file}"; then
    printf 'expected %s to contain: %s\n' "${file}" "${expected}" >&2
    exit 1
  fi
}

bash -n "${SMOKE}"

set +e
invalid_output="$({
  BENCHMARK_CASE_SLUG="Invalid slug" \
    SUPABASE_URL="https://example.invalid" \
    SUPABASE_SERVICE_ROLE_KEY="test-only" \
    RUNNER_SHARED_SECRET="test-only" \
    START_LOCAL_SERVICES="false" \
    bash "${SMOKE}"
} 2>&1)"
invalid_status=$?
set -e
if [[ "${invalid_status}" -ne 2 || "${invalid_output}" != *"BENCHMARK_CASE_SLUG must be a lowercase hyphenated slug."* ]]; then
  echo "invalid benchmark case slug was not rejected before smoke startup" >&2
  exit 1
fi

require_text "${SMOKE}" 'BENCHMARK_CASE_SLUG="${BENCHMARK_CASE_SLUG:-hosted-web-suite}"'
require_text "${SMOKE}" 'slug: `eq.${benchmarkCaseSlug}`'
require_text "${SMOKE}" 'redirect: "manual"'
require_text "${SMOKE}" 'return checkedFetch(new URL(location, formUrl));'
require_text "${SMOKE}" 'const minimumScore = minimumFullPassScore(revisionManifest);'
require_text "${SMOKE}" 'aggregateScore < minimumScore'
require_text "${WORKFLOW}" 'gh workflow run hosted-variant-sweep.yml --ref develop --repo "${GITHUB_REPOSITORY}"'
require_text "${WORKFLOW}" 'benchmark_case_slug:'
require_text "${WORKFLOW}" '          - hosted-web-suite'
require_text "${WORKFLOW}" '          - hosted-web-hard-suite'
require_text "${WORKFLOW}" 'BENCHMARK_CASE_SLUG: ${{ matrix.benchmark_case_slug }}'

echo "hosted variant sweep workflow tests passed"
