#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Run this installer with sudo on the Docker host.' >&2; exit 1; }
user="${1:?Specify the dedicated rootless development user}"
uid="$(id -u "$user")"
[[ "$user" != "${SUDO_USER:-root}" ]] || { echo 'Use a dedicated development user, not the invoking operator account.' >&2; exit 1; }
[[ "$uid" -ge 1000 ]] || { echo 'Expected an unprivileged development user.' >&2; exit 1; }
[[ -d "/sys/fs/cgroup/user.slice/user-$uid.slice" ]] || {
  echo 'The development user manager must already be running.' >&2; exit 1;
}
directory="/etc/systemd/system/user-$uid.slice.d"
target="$directory/agentbench-development.conf"
temporary="$(mktemp)"
trap 'rm -f "$temporary"' EXIT
printf '[Slice]\nMemoryAccounting=yes\nCPUQuota=400%%\nMemoryMax=4G\n' > "$temporary"
if [[ -e "$target" ]] && ! cmp -s "$temporary" "$target"; then
  echo 'Existing rootless budget differs; review it before replacement.' >&2; exit 1
fi
install -d -m 0755 "$directory"
install -m 0644 "$temporary" "$target"
systemctl daemon-reload
systemctl set-property --runtime "user-$uid.slice" CPUQuota=400% MemoryMax=4G
[[ "$(cat "/sys/fs/cgroup/user.slice/user-$uid.slice/memory.max")" == 4294967296 ]] || exit 1
[[ "$(cat "/sys/fs/cgroup/user.slice/user-$uid.slice/cpu.max")" == '400000 100000' ]] || {
  echo 'Verify CPU quota and period before rollout.' >&2; exit 1;
}
systemctl show "user-$uid.slice" --property=MemoryMax --property=CPUQuotaPerSecUSec
echo 'Rootless development user budget installed. Verify the active kernel limits before rollout.'
