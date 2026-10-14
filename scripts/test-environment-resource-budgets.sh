#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
checker="$ROOT_DIR/infra/scripts/check-environment-resource-budget.sh"
installer="$ROOT_DIR/infra/scripts/install-environment-resource-slices.sh"
bash -n "$checker"
bash -n "$installer"
mkdir -p "$temporary/bin"
cp "$ROOT_DIR/tests/fixtures/resource-budgets/"* "$temporary/bin/"
chmod +x "$temporary/bin/"*
for environment in development production; do
  PATH="$temporary/bin:$PATH" bash "$checker" "$environment" "agentbench-$environment.slice"
done
reject() {
  if PATH="$temporary/bin:$PATH" "$@" >/dev/null 2>&1; then
    echo 'Resource budget accepted an invalid configuration.' >&2; exit 1
  fi
}
reject bash "$checker" production agentbench-development.slice
reject bash "$checker" unknown agentbench-production.slice
reject env FAKE_CGROUP_BACKEND=cgroupfs/1 bash "$checker" production agentbench-production.slice
reject env FAKE_SLICE_STATE=inactive bash "$checker" development agentbench-development.slice
reject env FAKE_SLICE_MEMORY=infinity bash "$checker" production agentbench-production.slice
reject env FAKE_SLICE_CPU=infinity bash "$checker" development agentbench-development.slice
PATH="$temporary/bin:$PATH" FAKE_SECURITY_OPTIONS='["name=rootless"]' \
  bash "$checker" development agentbench-development.slice
PATH="$temporary/bin:$PATH" FAKE_SECURITY_OPTIONS='["name=rootless"]' \
  XDG_RUNTIME_DIR=/wrong-user DBUS_SESSION_BUS_ADDRESS=unix:path=/wrong-user/bus \
  bash "$checker" development agentbench-development.slice
reject env FAKE_SECURITY_OPTIONS='["name=rootless"]' bash "$checker" production agentbench-production.slice
reject env FAKE_SECURITY_OPTIONS='["name=rootless"]' FAKE_DAEMON_GROUP=/system.slice/docker.service \
  bash "$checker" development agentbench-development.slice
reject env FAKE_SECURITY_OPTIONS='["name=rootless"]' FAKE_SLICE_MEMORY=infinity \
  bash "$checker" development agentbench-development.slice
bash -n "$ROOT_DIR/infra/scripts/install-rootless-development-budget.sh"

export ELASTIC_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export KIBANA_SYSTEM_PASSWORD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export LOGSTASH_PASSWORD=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
export KIBANA_ENCRYPTION_KEY=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
export GRAFANA_ADMIN_PASSWORD=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
export HOSTED_METRICS_TOKEN=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
if docker compose version >/dev/null 2>&1; then compose=(docker compose); else compose=(docker-compose); fi
for environment in development production; do
  bash "$ROOT_DIR/infra/scripts/init-single-vm-env.sh" "$temporary/$environment.env" \
    https://web.example.test https://hosted.example.test "$environment" >/dev/null
  AGENTBENCH_CGROUP_PARENT="agentbench-$environment.slice" "${compose[@]}" \
    --env-file "$temporary/$environment.env" -f "$ROOT_DIR/infra/docker/docker-compose.single-vm.yml" \
    config --format json > "$temporary/$environment-apps.json"
  AGENTBENCH_CGROUP_PARENT="agentbench-$environment.slice" DEPLOYMENT_ENVIRONMENT="$environment" \
    ELK_PROJECT_NAME="agentbench-$environment-elk" ELK_RUNTIME_NETWORK="agentbench-$environment-default" \
    "${compose[@]}" -f "$ROOT_DIR/infra/docker/docker-compose.elk.yml" config --format json > "$temporary/$environment-elk.json"
done
budget_env="$temporary/development.env"
printf '\nAGENTBENCH_CGROUP_PARENT=agentbench-production.slice\n' >> "$budget_env"
set +e
output="$(PATH="$temporary/bin:$PATH" GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test \
  GHCR_USERNAME=test IMAGE_TAG=0123456789ab bash "$ROOT_DIR/infra/scripts/deploy-single-vm.sh" \
  "$budget_env" development 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 && "$output" == *'Resource slice does not match the environment.'* ]] || {
  echo 'Deployment did not reject cross-environment budgets before container startup.' >&2; exit 1;
}
printf '\nAGENTBENCH_CGROUP_PARENT=agentbench-development.slice\n' >> "$budget_env"
set +e
output="$(PATH="$temporary/bin:$PATH" FAKE_SLICE_STATE=inactive \
  GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test GHCR_USERNAME=test IMAGE_TAG=0123456789ab \
  bash "$ROOT_DIR/infra/scripts/deploy-single-vm.sh" "$budget_env" development 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 && "$output" == *'resource slice is inactive or has incorrect'* ]] || {
  echo 'Deployment did not reject an inactive budget before container startup.' >&2; exit 1;
}
printf 'AGENTBENCH_CGROUP_PARENT=agentbench-production.slice\n' > "$temporary/mismatched-elk.env"
printf '\nELK_ENV_FILE=%s\n' "$temporary/mismatched-elk.env" >> "$budget_env"
set +e
output="$(PATH="$temporary/bin:$PATH" GITHUB_REPOSITORY_OWNER=test GHCR_TOKEN=test \
  GHCR_USERNAME=test IMAGE_TAG=0123456789ab bash "$ROOT_DIR/infra/scripts/deploy-single-vm.sh" \
  "$budget_env" development 2>&1)"
status=$?
set -e
[[ "$status" -ne 0 && "$output" == *'Runtime and observability resource slices do not match.'* ]] || {
  echo 'Deployment did not reject mismatched monitoring budgets before container startup.' >&2; exit 1;
}
node --input-type=module - "$temporary" "$ROOT_DIR" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const [temporary,root]=process.argv.slice(2);
for(const environment of ['development','production']){
  for(const kind of ['apps','elk']){
    const config=JSON.parse(readFileSync(`${temporary}/${environment}-${kind}.json`,'utf8'));
    const services=Object.values(config.services);
    assert.equal(services.length,kind==='apps'?10:7);
    for(const service of services)assert.equal(service.cgroup_parent,`agentbench-${environment}.slice`);
  }
  const unit=readFileSync(`${root}/infra/systemd/agentbench-${environment}.slice`,'utf8');
  assert.match(unit,new RegExp(`CPUQuota=${environment==='production'?800:400}%`));
  assert.match(unit,new RegExp(`MemoryMax=${environment==='production'?7:4}G`));
}
JS
echo 'Aggregate environment slice validation and complete Compose coverage passed.'
