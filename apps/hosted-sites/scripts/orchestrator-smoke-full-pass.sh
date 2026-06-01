#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SMOKE_MODE=full-pass bash "${ROOT_DIR}/apps/hosted-sites/scripts/orchestrator-smoke.sh"
