#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT
export ELASTIC_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export KIBANA_SYSTEM_PASSWORD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export LOGSTASH_PASSWORD=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
export KIBANA_ENCRYPTION_KEY=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
export DEPLOYMENT_ENVIRONMENT=test
export GRAFANA_ADMIN_PASSWORD=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
export HOSTED_METRICS_TOKEN=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
if docker compose version >/dev/null 2>&1; then compose=(docker compose); else compose=(docker-compose); fi
for environment in development production; do
  port=12201; kibana=5601; grafana=3300; network=agentbench-single-vm_default
  if [[ "$environment" == development ]]; then port=12202; kibana=5602; grafana=3302; network=agentbench-local-development_default; fi
  ELK_PROJECT_NAME="agentbench-$environment-elk" ELK_GELF_PORT="$port" ELK_KIBANA_PORT="$kibana" \
    ELK_GRAFANA_PORT="$grafana" ELK_RUNTIME_NETWORK="$network" \
    "${compose[@]}" -f "$ROOT_DIR/infra/docker/docker-compose.elk.yml" config --format json > "$temporary_dir/$environment.json"
done
if env -u ELASTIC_PASSWORD ELK_PROJECT_NAME=agentbench-test-elk ELK_RUNTIME_NETWORK=agentbench-test_default \
  "${compose[@]}" -f "$ROOT_DIR/infra/docker/docker-compose.elk.yml" config >/dev/null 2>&1; then
  echo 'ELK configuration accepted a missing Elasticsearch password.' >&2
  exit 1
fi
python3 - "$temporary_dir" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
configs = [json.loads((root / (env + '.json')).read_text()) for env in ('development', 'production')]
for config in configs:
    services = config['services']
    assert set(services) == {'elasticsearch', 'elk-setup', 'logstash', 'kibana', 'prometheus', 'grafana'}
    assert not services['elasticsearch'].get('ports')
    assert services['elasticsearch']['environment']['xpack.security.enabled'] == 'true'
    assert config['networks']['elk']['internal']
    assert config['networks']['hosted-runtime']['external']
    assert 'elk-ingress' in services['kibana']['networks']
    assert 'elk-ingress' not in services['elasticsearch']['networks']
    assert not services['prometheus'].get('ports')
    assert services['grafana']['environment']['GF_AUTH_ANONYMOUS_ENABLED'] == 'false'
    assert services['logstash']['depends_on']['elk-setup']['condition'] == 'service_completed_successfully'
    for service in services.values():
        for port in service.get('ports', []):
            assert port['host_ip'] == '127.0.0.1'
        assert all('docker.sock' not in v.get('source', '') for v in service.get('volumes', []))
for resource in ('volumes', 'networks'):
    assert not {v['name'] for v in configs[0][resource].values()} & {v['name'] for v in configs[1][resource].values()}
ports = lambda c: {p['published'] for s in c['services'].values() for p in s.get('ports', [])}
assert not ports(configs[0]) & ports(configs[1])
PY
ELK_GELF_PORT=12202 "${compose[@]}" -f "$ROOT_DIR/infra/docker/docker-compose.elk-logging.yml" config --no-consistency --format json |
python3 -c '
import json, sys
services = json.load(sys.stdin)["services"]
assert len(services) == 5
for service in services.values():
    logging = service["logging"]
    assert logging["driver"] == "gelf"
    assert logging["options"]["gelf-address"] == "udp://127.0.0.1:12202"
    assert logging["options"]["mode"] == "non-blocking"
'
bash -n "$ROOT_DIR/infra/elk/bootstrap.sh"
ruby "$ROOT_DIR/tests/helpers/elk-filter-test.rb"
echo 'ELK authentication, port isolation and non-blocking log transport checks passed.'
