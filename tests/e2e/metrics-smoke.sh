#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Specify the protected test observability environment file}"
source "${env_file}"
if [[ "${DEPLOYMENT_ENVIRONMENT:-}" != development && "${DEPLOYMENT_ENVIRONMENT:-}" != test ]]; then
  echo 'Metrics smoke requires a development or test environment.' >&2
  exit 1
fi
compose=(docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.elk.yml")
for attempt in {1..30}; do
  if "${compose[@]}" exec -T prometheus wget -qO- http://127.0.0.1:9090/api/v1/targets |
    python3 -c '
import json, sys
data = json.load(sys.stdin)
targets = [t for t in data["data"]["activeTargets"] if t["labels"]["job"] in ("hosted-services", "orchestrator-workers")]
assert len(targets) == 4
assert all(t["health"] == "up" for t in targets)
'; then
    echo 'Prometheus authenticated hosted-service scrapes passed.'
    exit 0
  fi
  sleep 2
done
echo 'Prometheus hosted-service scrape health did not become ready.' >&2
exit 1
