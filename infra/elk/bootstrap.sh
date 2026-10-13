#!/usr/bin/env bash
set -euo pipefail

# Hex secrets keep JSON construction unambiguous and avoid shell interpolation.
for secret_name in ELASTIC_PASSWORD KIBANA_SYSTEM_PASSWORD LOGSTASH_PASSWORD; do
  if [[ ! "${!secret_name}" =~ ^[a-fA-F0-9]{64}$ ]]; then
    echo "${secret_name} must contain exactly 64 hexadecimal characters." >&2
    exit 1
  fi
done

put() {
  curl --silent --show-error --fail --output /dev/null \
    -u "elastic:${ELASTIC_PASSWORD}" -H 'Content-Type: application/json' \
    -X PUT "http://elasticsearch:9200/$1" --data-binary "$2"
}

put '_security/user/kibana_system/_password' "{\"password\":\"${KIBANA_SYSTEM_PASSWORD}\"}"
put '_security/role/agentbench_log_writer' '{"cluster":["monitor"],"indices":[{"names":["agentbench-logs-*"],"privileges":["create_index","create_doc","view_index_metadata"]}]}'
put '_security/user/agentbench_logstash' "{\"password\":\"${LOGSTASH_PASSWORD}\",\"roles\":[\"agentbench_log_writer\"]}"
put '_ilm/policy/agentbench-logs' '{"policy":{"phases":{"hot":{"actions":{}},"delete":{"min_age":"7d","actions":{"delete":{}}}}}}'
mapping='{"dynamic":"strict","properties":{"@timestamp":{"type":"date"},"environment":{"type":"keyword"},"service":{"type":"keyword"},"event":{"type":"keyword"},"request_id":{"type":"keyword"},"method":{"type":"keyword"},"route":{"type":"keyword"},"status":{"type":"integer"},"duration_ms":{"type":"float"},"role":{"type":"keyword"},"command_type":{"type":"keyword"},"command_id":{"type":"keyword"},"run_id":{"type":"keyword"},"attempt_id":{"type":"keyword"},"session_id":{"type":"keyword"},"partition":{"type":"integer"},"source":{"type":"keyword"}}}'
put '_index_template/agentbench-logs' "{\"index_patterns\":[\"agentbench-logs-*\"],\"template\":{\"settings\":{\"number_of_shards\":1,\"number_of_replicas\":0,\"index.lifecycle.name\":\"agentbench-logs\"},\"mappings\":${mapping}}}"
# Templates affect new indices only; upgrade today's existing strict mapping too.
status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  -u "elastic:${ELASTIC_PASSWORD}" -H 'Content-Type: application/json' \
  -X PUT 'http://elasticsearch:9200/agentbench-logs-*/_mapping' --data-binary "${mapping}")"
[[ "${status}" == 200 || "${status}" == 404 ]] || { echo 'Existing log mapping upgrade failed.' >&2; exit 1; }
put '_security/role/agentbench_log_reader' '{"cluster":[],"indices":[{"names":["agentbench-logs-*"],"privileges":["read","view_index_metadata"]}],"applications":[{"application":"kibana-.kibana","privileges":["read"],"resources":["space:default"]}]}'
echo 'ELK users, roles, retention and index template configured.'
