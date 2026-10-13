#!/usr/bin/env bash
set -euo pipefail
ready=false
for attempt in $(seq 1 90); do
  if curl --max-time 5 -fsS -u "elastic:${ELASTIC_PASSWORD}" http://kibana:5601/api/status >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo 'Kibana did not become ready for saved-search provisioning.' >&2
  exit 1
fi
# These stable IDs belong to this stack; unrelated operator searches are untouched.
curl --max-time 30 -fsS -u "elastic:${ELASTIC_PASSWORD}" \
  -H 'kbn-xsrf: setup' -H 'Content-Type: application/json' \
  -X POST http://kibana:5601/api/data_views/data_view \
  -d '{"data_view":{"id":"agentbench-logs","title":"agentbench-logs-*","timeFieldName":"@timestamp"},"override":true}' >/dev/null
for view in /setup/views/*.json; do
  id="$(basename "$view" .json)"
  curl --max-time 30 -fsS -u "elastic:${ELASTIC_PASSWORD}" \
    -H 'kbn-xsrf: setup' -H 'Content-Type: application/json' \
    -X POST "http://kibana:5601/api/saved_objects/search/${id}?overwrite=true" \
    --data-binary "@${view}" >/dev/null
done
echo 'AgentBench Kibana data view and lifecycle searches provisioned.'
