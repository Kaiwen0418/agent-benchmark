#!/usr/bin/env bash
set -euo pipefail

changed_files="$(cat)"

matches_any() {
  local pattern
  for pattern in "$@"; do
    if printf '%s\n' "$changed_files" | grep -Eq "$pattern"; then
      return 0
    fi
  done
  return 1
}

common_patterns=(
  '^\.github/workflows/deploy-hosted-sites\.yml$'
  '^packages/(scoring|shared)/'
  '^package\.json$'
  '^pnpm-lock\.yaml$'
  '^pnpm-workspace\.yaml$'
  '^tsconfig\.base\.json$'
  '^turbo\.json$'
)

hosted_sites=false
orchestrator=false
infra=false
topology=false

if matches_any '^apps/hosted-sites/' '^infra/docker/hosted-sites\.Dockerfile$' "${common_patterns[@]}"; then
  hosted_sites=true
fi
if matches_any '^apps/hosted-orchestrator/' '^infra/docker/hosted-orchestrator\.Dockerfile$' "${common_patterns[@]}"; then
  orchestrator=true
fi
if matches_any '^infra/nginx/'; then
  infra=true
fi
if matches_any '^infra/docker/docker-compose\.server\.yml$' \
  '^infra/scripts/deploy-hosted-stack\.sh$' \
  '^infra/scripts/verify-orchestrator-worker-recovery\.sh$' \
  '^infra/scripts/validate-orchestrator-partitions\.sh$'; then
  topology=true
fi

printf 'hosted_sites=%s\n' "$hosted_sites"
printf 'orchestrator=%s\n' "$orchestrator"
printf 'infra=%s\n' "$infra"
printf 'topology=%s\n' "$topology"
