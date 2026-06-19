#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Deployment classifier =="
bash scripts/test-deploy-classifier.sh

echo "== Orchestrator topology =="
bash scripts/test-orchestrator-topology.sh

echo "== Web library tests =="
pnpm --filter web test

echo "== Coverage-gated tests =="
bash scripts/test-coverage.sh

echo "== Local service smoke =="
bash scripts/smoke-local.sh

echo "== Production builds =="
pnpm --filter web build
pnpm --filter @agentbench/scoring build
pnpm --filter hosted-sites build
pnpm --filter hosted-orchestrator build

echo "repository verification passed"
