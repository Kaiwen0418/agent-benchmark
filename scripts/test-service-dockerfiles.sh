#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCHESTRATOR_DOCKERFILE="${ROOT_DIR}/infra/docker/hosted-orchestrator.Dockerfile"

database_copy_count="$(grep -c '^COPY packages/database ./packages/database$' "${ORCHESTRATOR_DOCKERFILE}")"
if [[ "${database_copy_count}" != "2" ]]; then
  echo "hosted-orchestrator image must copy packages/database into build and runtime stages." >&2
  exit 1
fi

required_lines=(
  'RUN pnpm --filter @agentbench/database build:runtime'
  'COPY --from=build /app/packages/database/dist ./packages/database/dist'
  'CMD ["node", "--conditions=agentbench-runtime", "apps/hosted-orchestrator/dist/apps/hosted-orchestrator/src/server.js"]'
)
for required_line in "${required_lines[@]}"; do
  if ! grep -Fqx "${required_line}" "${ORCHESTRATOR_DOCKERFILE}"; then
    echo "hosted-orchestrator image is missing: ${required_line}" >&2
    exit 1
  fi
done

echo "Service Dockerfile tests passed"
