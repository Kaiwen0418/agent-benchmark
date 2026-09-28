#!/usr/bin/env bash
set -euo pipefail

runner_user="${1:-frodo}"
env_file="${2:-/srv/agentbench/secrets/development.env}"
runner_group="${3:-agentbench-runner}"

[[ "${EUID}" -eq 0 ]] || {
  echo "Run this script as root." >&2
  exit 1
}
id "${runner_user}" >/dev/null 2>&1 || {
  echo "Runner user ${runner_user} does not exist." >&2
  exit 1
}
[[ -f "${env_file}" ]] || {
  echo "Development environment file ${env_file} does not exist." >&2
  exit 1
}

groupadd --force "${runner_group}"
usermod --append --groups docker,"${runner_group}" "${runner_user}"

# The runner may traverse the protected tree but can only read the explicitly
# group-owned development environment file. Production credentials remain 0600.
current="$(dirname "${env_file}")"
while [[ "${current}" != / && "${current}" != /srv ]]; do
  chown root:"${runner_group}" "${current}"
  chmod 0710 "${current}"
  current="$(dirname "${current}")"
done
chown root:"${runner_group}" "${env_file}"
chmod 0660 "${env_file}"

echo "Configured ${runner_user} for isolated development deployment access."
