#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 2 ]] || ! [[ "$1" =~ ^[1-9][0-9]*$ ]]; then
  echo "Usage: $0 <partition-count> <comma-separated-assignment> [...]" >&2
  exit 2
fi

partition_count="$1"
shift
owners=()
for ((partition = 0; partition < partition_count; partition += 1)); do
  owners[partition]=0
done

for assignment in "$@"; do
  IFS=',' read -r -a partitions <<< "${assignment}"
  for partition in "${partitions[@]}"; do
    if ! [[ "${partition}" =~ ^[0-9]+$ ]] || (( partition >= partition_count )); then
      echo "Invalid orchestrator partition: ${partition}. Expected 0-$((partition_count - 1))." >&2
      exit 1
    fi
    if (( owners[partition] > 0 )); then
      echo "Duplicate orchestrator partition assignment: ${partition}." >&2
      exit 1
    fi
    owners[partition]=1
  done
done

for ((partition = 0; partition < partition_count; partition += 1)); do
  if (( owners[partition] == 0 )); then
    echo "Missing orchestrator partition assignment: ${partition}." >&2
    exit 1
  fi
done

echo "orchestrator partition coverage valid: ${partition_count} partitions"
