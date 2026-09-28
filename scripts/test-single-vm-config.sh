#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT
env_file="${temporary_dir}/runtime.env"
bash "${ROOT_DIR}/infra/scripts/init-single-vm-env.sh" "${env_file}" \
  https://web.example.test https://hosted.example.test >/dev/null
if bash "${ROOT_DIR}/infra/scripts/init-single-vm-env.sh" "${env_file}" \
  https://web.example.test https://hosted.example.test >/dev/null 2>&1; then
  echo "Credential initialization overwrote an existing file." >&2; exit 1
fi
if docker compose version >/dev/null 2>&1; then compose=(docker compose); else compose=(docker-compose); fi
"${compose[@]}" --env-file "${env_file}" \
  -f "${ROOT_DIR}/infra/docker/docker-compose.single-vm.yml" config --format json |
python3 -c '
import json, sys
c = json.load(sys.stdin)
s = c["services"]
assert len(s) == 10
for service in s.values():
    for port in service.get("ports", []):
        assert port["host_ip"] == "127.0.0.1"
assert "DATABASE_URL" not in s["hosted-sites"]["environment"]
assert s["web"]["environment"]["AUTH_URL"] == "https://web.example.test"
for name in ("hosted-sites", "hosted-orchestrator", "hosted-orchestrator-worker-0", "hosted-orchestrator-worker-1"):
    assert s[name]["environment"]["AGENTBENCH_WEB_URL"] == "http://web:3000"
    assert s[name]["environment"]["AGENTBENCH_WEB_PUBLIC_URL"] == "https://web.example.test"
assert s["postgres"]["environment"]["AGENTBENCH_DATABASE_NAME"] == s["pgbouncer"]["environment"]["DB_NAME"] == "agentbench_production"
assert s["web"]["environment"]["RUN_CREATION_MODE"] == "frozen"
for name in ("session-redis", "orchestrator-redis"):
    assert s[name]["volumes"][0]["target"] == "/data"
    assert "noeviction" in s[name]["command"]
assert set(c["volumes"]) == {"postgres-data", "web-artifacts", "session-data", "command-data"}
'
development_env="${temporary_dir}/development.env"
bash "${ROOT_DIR}/infra/scripts/init-single-vm-env.sh" "$development_env" \
  https://web-test.example.test https://hosted-test.example.test development >/dev/null
for environment in production development; do
  input="$env_file"
  [[ "$environment" != development ]] || input="$development_env"
  "${compose[@]}" --env-file "$input" \
    -f "${ROOT_DIR}/infra/docker/docker-compose.single-vm.yml" config --format json > "$temporary_dir/$environment.json"
done
python3 - "$temporary_dir" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
p = json.loads((root / 'production.json').read_text())
d = json.loads((root / 'development.json').read_text())
assert p['name'] == 'agentbench-single-vm'
assert d['name'] == 'agentbench-local-development'
for resource in ('volumes', 'networks'):
    assert not ({v['name'] for v in p[resource].values()} & {v['name'] for v in d[resource].values()})
ports = lambda c: {v['published'] for s in c['services'].values() for v in s.get('ports', [])}
assert not ports(p) & ports(d)
assert ports(d) == {'3001', '8081', '55433', '65433'}
s = d['services']
assert s['postgres']['environment']['AGENTBENCH_DATABASE_NAME'] == 'agentbench_development'
assert s['pgbouncer']['environment']['DB_USER'] == 'agentbench_dev'
assert s['web']['environment']['AUTH_URL'] == 'https://web-test.example.test'
for key in ('AUTH_SECRET', 'RUNNER_SHARED_SECRET', 'DATABASE_URL'):
    assert s['web']['environment'][key] != p['services']['web']['environment'][key]
assert s['web']['environment']['DATABASE_URL'].endswith('/agentbench_development')
assert s['web']['environment']['RUN_CREATION_MODE'] == 'frozen'
assert s['web']['environment']['AUTH_SIGN_IN_MODE'] == 'frozen'
assert s['postgres']['environment']['POSTGRES_PASSWORD'] != p['services']['postgres']['environment']['POSTGRES_PASSWORD']
for service in s.values():
    for port in service.get('ports', []):
        assert port['host_ip'] == '127.0.0.1'
PY
echo "Single-VM configuration, credential initialization and environment isolation checks passed."
