#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$(id -u)" == 0 ]] || { echo 'Run this installer with sudo on the Docker host.' >&2; exit 1; }
[[ "$(docker info --format '{{.CgroupDriver}}/{{.CgroupVersion}}')" == systemd/2 ]] || {
  echo 'Resource budgets require Docker systemd cgroups v2.' >&2; exit 1;
}
# This installs persistent budgets only. It never starts/recreates app containers.
for environment in development production; do
  source="$ROOT_DIR/infra/systemd/agentbench-$environment.slice"
  target="/etc/systemd/system/agentbench-$environment.slice"
  if [[ -e "$target" ]] && ! cmp -s "$source" "$target"; then
    echo "Existing $environment resource slice differs; review it before replacement." >&2
    exit 1
  fi
done
for environment in development production; do
  install -m 0644 "$ROOT_DIR/infra/systemd/agentbench-$environment.slice" "/etc/systemd/system/agentbench-$environment.slice"
done
systemctl daemon-reload
systemctl start agentbench-development.slice agentbench-production.slice
for environment in development production; do
  bash "$ROOT_DIR/infra/scripts/check-environment-resource-budget.sh" "$environment" "agentbench-$environment.slice"
done
echo 'Slices installed. Configure each runtime/ELK environment file and recreate containers during an approved rollout.'
