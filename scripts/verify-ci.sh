#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Hosted variant sweep workflow =="
bash scripts/test-hosted-variant-sweep.sh

echo "== Deployment classifier =="
bash scripts/test-deploy-classifier.sh

echo "== Registry retry helper =="
bash scripts/test-registry-retry.sh

echo "== Orchestrator topology =="
bash scripts/test-orchestrator-topology.sh

echo "== Redis topology =="
bash scripts/test-redis-topology.sh

echo "== Web secret boundary =="
bash scripts/check-web-secret-boundary.sh

echo "== Database ownership =="
bash scripts/check-database-ownership.sh

echo "== Test layout =="
bash scripts/check-test-layout.sh

echo "== Hosted app consistency =="
pnpm hosted-app:check

echo "== Lifecycle Postgres integration =="
bash scripts/test-lifecycle-postgres.sh

echo "== Benchmark case privacy =="
bash scripts/test-benchmark-case-privacy.sh

echo "== Hosted metadata boundaries =="
bash scripts/test-hosted-metadata-boundaries.sh

echo "== Benchmark case revisions =="
bash scripts/test-case-revisions-postgres.sh

echo "== Hosted public read models =="
bash scripts/test-hosted-read-models-postgres.sh

echo "== Benchmark catalog =="
pnpm --filter @agentbench/test-cases test
pnpm catalog:check

echo "== Web library tests =="
pnpm --filter web test

echo "== Coverage-gated tests =="
bash scripts/test-coverage.sh

echo "== Local service smoke =="
bash tests/e2e/smoke-local.sh

echo "== Production builds =="
pnpm --filter web build
pnpm --filter @agentbench/scoring build
pnpm --filter hosted-sites build
pnpm --filter hosted-orchestrator build

echo "repository verification passed"
