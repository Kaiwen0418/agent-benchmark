#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${1:?Usage: bash tests/e2e/elk-smoke.sh /protected/test-elk.env}"
compose=(docker compose --env-file "$env_file" -f "$ROOT_DIR/infra/docker/docker-compose.elk.yml")
environment="$("${compose[@]}" exec -T logstash printenv DEPLOYMENT_ENVIRONMENT)"
if [[ "$environment" != development && "$environment" != test ]]; then
  echo 'ELK smoke requires a development or test environment.' >&2
  exit 1
fi
# Synthetic records only; the receiver verifies their safe indexed projection.
request_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
for attempt in {1..30}; do
"${compose[@]}" exec -T -e "SMOKE_REQUEST_ID=$request_id" elasticsearch bash -s <<'SH'
set -euo pipefail
# Bash UDP avoids requiring an extra utility inside the Elastic image.
safe="{\"event\":\"http.request\",\"service\":\"gateway\",\"method\":\"GET\",\"route\":\"health\",\"status\":200,\"duration_seconds\":0.25,\"request_id\":\"$SMOKE_REQUEST_ID\",\"token\":\"private-smoke-sentinel\"}"
# GELF contains a JSON string as short_message: escape its quotes.
escaped="${safe//\"/\\\"}"
printf '%s' "{\"version\":\"1.1\",\"host\":\"smoke\",\"short_message\":\"$escaped\"}" > /dev/udp/logstash/12201
printf '%s' '{"version":"1.1","host":"smoke","short_message":"private-smoke-sentinel unstructured error"}' > /dev/udp/logstash/12201
SH
  result="$("${compose[@]}" exec -T -e "SMOKE_REQUEST_ID=$request_id" elasticsearch bash -c '
    curl -fsS -u "elastic:$ELASTIC_PASSWORD" -H "Content-Type: application/json" \
      "http://localhost:9200/agentbench-logs-*/_search" \
      --data-binary "{\"query\":{\"term\":{\"request_id\":\"$SMOKE_REQUEST_ID\"}}}"' || true)"
  if printf '%s' "$result" | python3 -c '
import json, sys
try:
    hits = json.load(sys.stdin)["hits"]["hits"]
except (ValueError, KeyError):
    sys.exit(1)
if not hits: sys.exit(1)
source = hits[0]["_source"]
assert source["duration_ms"] == 250
assert source["service"] == "gateway"
assert source["environment"] in ("test", "development")
assert set(source) <= {"@timestamp", "@version", "environment", "event", "service", "request_id", "method", "route", "status", "duration_ms"}
assert "private-smoke-sentinel" not in json.dumps(source)
'; then
    echo 'ELK synthetic ingestion, timing and privacy smoke passed.'
    exit 0
  fi
  sleep 2
done
echo 'ELK smoke failed: inspect setup and Logstash health/configuration.' >&2
exit 1
