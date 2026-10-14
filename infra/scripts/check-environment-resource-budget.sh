#!/usr/bin/env bash
set -euo pipefail
environment="${1:?Specify development or production}"
parent="${2:?Specify the configured cgroup parent}"
case "$environment" in
  production) expected_parent=agentbench-production.slice; expected_memory=7516192768; expected_cpu=8s ;;
  development) expected_parent=agentbench-development.slice; expected_memory=4294967296; expected_cpu=4s ;;
  *) echo 'Unknown resource-budget environment.' >&2; exit 1 ;;
esac
[[ "$parent" == "$expected_parent" ]] || { echo 'Resource slice does not match the environment.' >&2; exit 1; }
[[ "$(docker info --format '{{.CgroupDriver}}/{{.CgroupVersion}}')" == systemd/2 ]] || {
  echo 'Resource budgets require Docker systemd cgroups v2.' >&2; exit 1;
}
state="$(LC_ALL=C systemctl show "$parent" --property=ActiveState --property=MemoryMax --property=CPUQuotaPerSecUSec)"
if ! grep -Fxq 'ActiveState=active' <<< "$state" ||
   ! grep -Fxq "MemoryMax=$expected_memory" <<< "$state" ||
   ! grep -Fxq "CPUQuotaPerSecUSec=$expected_cpu" <<< "$state"; then
  echo "$environment resource slice is inactive or has incorrect CPU/memory limits; install the repository slice units first." >&2
  exit 1
fi
echo "$environment aggregate resource budget verified."
