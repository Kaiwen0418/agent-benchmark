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
security_options="$(docker info --format '{{json .SecurityOptions}}')"
unit="$parent"
if [[ "$security_options" == *name=rootless* ]]; then
  [[ "$environment" == development ]] || { echo 'Rootless resource budgets are supported only for development.' >&2; exit 1; }
  uid="$(id -u)"
  [[ "$uid" -ge 1000 ]] || { echo 'Rootless development requires a dedicated unprivileged user.' >&2; exit 1; }
  unit="user-$uid.slice"
  user_group="$(systemctl show "$unit" --property=ControlGroup --value)"
  # System-level CI runner services do not inherit a login session's bus.
  daemon_group="$(XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
    systemctl --user show docker.service --property=ControlGroup --value)"
  [[ "$user_group" == "/user.slice/$unit" && "$daemon_group" == "$user_group/"* ]] || {
    echo 'Rootless Docker is not inside the expected dedicated user budget.' >&2; exit 1;
  }
fi
state="$(LC_ALL=C systemctl show "$unit" --property=ActiveState --property=MemoryMax --property=CPUQuotaPerSecUSec)"
if ! grep -Fxq 'ActiveState=active' <<< "$state" ||
   ! grep -Fxq "MemoryMax=$expected_memory" <<< "$state" ||
   ! grep -Fxq "CPUQuotaPerSecUSec=$expected_cpu" <<< "$state"; then
  echo "$environment resource slice is inactive or has incorrect CPU/memory limits; install the matching host budget first." >&2
  exit 1
fi
echo "$environment aggregate resource budget verified."
