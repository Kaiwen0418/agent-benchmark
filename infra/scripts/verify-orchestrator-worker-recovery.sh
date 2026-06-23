#!/usr/bin/env bash
set -euo pipefail

worker_plan() {
  printf '%s|%s\n' \
    'hosted-orchestrator-worker-0' "${ORCHESTRATOR_WORKER_0_PARTITIONS:-0,1,2,3,4,5,6,7}"
  printf '%s|%s\n' \
    'hosted-orchestrator-worker-1' "${ORCHESTRATOR_WORKER_1_PARTITIONS:-8,9,10,11,12,13,14,15}"
}

if [[ "${1:-}" == "--plan" ]]; then
  worker_plan
  exit 0
fi

required_variables=(
  COMPOSE_PROJECT_NAME
  DEPLOYMENT_ENVIRONMENT
  HOSTED_ORCHESTRATOR_PUBLIC_URL
  WORKER_RECOVERY_COMPOSE_FILE
  WORKER_RECOVERY_ENV_FILE
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required worker recovery variable ${variable} is not set." >&2
    exit 1
  fi
done

ORCHESTRATOR_PARTITION_COUNT="${ORCHESTRATOR_PARTITION_COUNT:-16}"
PUBLIC_URL="${HOSTED_ORCHESTRATOR_PUBLIC_URL%/}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
CURRENT_STOPPED_WORKER=""

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "docker compose plugin or docker-compose is required." >&2
  exit 127
fi

compose() {
  "${COMPOSE[@]}" --env-file "${WORKER_RECOVERY_ENV_FILE}" -f "${WORKER_RECOVERY_COMPOSE_FILE}" "$@"
}

restore_stopped_worker() {
  if [[ -n "${CURRENT_STOPPED_WORKER}" ]]; then
    echo "Restoring ${CURRENT_STOPPED_WORKER} after interrupted recovery verification." >&2
    compose start "${CURRENT_STOPPED_WORKER}" >/dev/null 2>&1 || true
  fi
}
trap restore_stopped_worker EXIT

append_summary() {
  [[ -n "${SUMMARY_FILE}" ]] || return 0
  printf '%s\n' "$@" >> "${SUMMARY_FILE}"
}

image_evidence() {
  local service="$1"
  local container_id
  container_id="$(compose ps -q "${service}" 2>/dev/null)"
  if [[ -z "${container_id}" ]]; then
    printf 'unavailable'
    return
  fi
  docker inspect "${container_id}" --format '{{.Config.Image}}@{{.Image}}'
}

probe_readiness() {
  local expected_status="$1"
  local expected_missing="$2"
  local body_file status body
  body_file="$(mktemp)"
  status="$(curl --silent --show-error --max-time 5 --output "${body_file}" --write-out '%{http_code}' "${PUBLIC_URL}" || true)"
  body="$(cat "${body_file}")"
  rm -f "${body_file}"

  [[ "${status}" == "${expected_status}" ]] || return 1
  node -e '
    const body = JSON.parse(process.argv[1]);
    const expected = process.argv[2].split(",").filter(Boolean).map(Number);
    if (body.commandBackbone !== "redis-streams" || body.mode !== "api") process.exit(1);
    if (JSON.stringify(body.missingPartitions) !== JSON.stringify(expected)) process.exit(1);
    if (body.ok !== (expected.length === 0)) process.exit(1);
  ' "${body}" "${expected_missing}"
}

wait_for_readiness() {
  local expected_status="$1"
  local expected_missing="$2"
  local label="$3"
  local attempt
  for attempt in $(seq 1 30); do
    if probe_readiness "${expected_status}" "${expected_missing}"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${label} readiness state." >&2
  return 1
}

partition_key_for() {
  local target_partition="$1"
  compose exec -T hosted-orchestrator node -e '
    const crypto = require("node:crypto");
    const target = Number(process.argv[1]);
    const count = Number(process.argv[2]);
    for (let index = 0; index < 100000; index += 1) {
      const key = `worker-recovery-p${target}-${index}`;
      const partition = crypto.createHash("sha256").update(key).digest().readUInt32BE(0) % count;
      if (partition === target) {
        process.stdout.write(key);
        process.exit(0);
      }
    }
    process.exit(1);
  ' "${target_partition}" "${ORCHESTRATOR_PARTITION_COUNT}"
}

queue_recovery_command() {
  local partition="$1"
  local command_id="$2"
  local partition_key="$3"
  compose exec -T orchestrator-redis redis-cli --raw XADD \
    "agentbench:orchestrator:commands:p${partition}" '*' \
    commandId "${command_id}" \
    type maintenance.cleanup \
    partitionKey "${partition_key}" \
    payload '{"trigger":"worker-recovery-verification"}' >/dev/null
}

wait_for_command_result() {
  local command_id="$1"
  local result=""
  local attempt
  for attempt in $(seq 1 30); do
    result="$(compose exec -T orchestrator-redis redis-cli --raw GET "agentbench:orchestrator:result:${command_id}" | tr -d '\r')"
    if [[ -n "${result}" ]] && node -e '
      const result = JSON.parse(process.argv[1]);
      process.exit(result.commandId === process.argv[2] && result.statusCode === 200 ? 0 : 1);
    ' "${result}" "${command_id}"; then
      printf '%s' "${result}"
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for queued command ${command_id}." >&2
  return 1
}

append_summary \
  '## Orchestrator worker recovery' \
  '' \
  "- Environment: \`${DEPLOYMENT_ENVIRONMENT}\`" \
  "- Compose project: \`${COMPOSE_PROJECT_NAME}\`" \
  "- Commit: \`${GITHUB_SHA:-unknown}\`" \
  "- Previous orchestrator image: \`${PREVIOUS_ORCHESTRATOR_IMAGE:-unavailable}\`" \
  "- Deployed orchestrator image: \`$(image_evidence hosted-orchestrator)\`" \
  "- Rollback source SHA: \`${ROLLBACK_SOURCE_SHA:-unknown}\`" \
  '' \
  '| Worker | Missing partitions observed | Queued command | Recovery |' \
  '| --- | --- | --- | --- |'

while IFS='|' read -r worker partitions; do
  target_partition="${partitions%%,*}"
  command_id="worker-recovery-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-${target_partition}-$(date +%s)"
  partition_key="$(partition_key_for "${target_partition}")"

  echo "Stopping ${worker}; expecting missing partitions ${partitions}."
  compose stop -t 1 "${worker}" >/dev/null
  CURRENT_STOPPED_WORKER="${worker}"

  # A 503 with the exact missing set proves the API and public gateway remain reachable.
  wait_for_readiness 503 "${partitions}" "${worker} degraded"
  queue_recovery_command "${target_partition}" "${command_id}" "${partition_key}"

  compose start "${worker}" >/dev/null
  wait_for_readiness 200 '' "${worker} recovered"
  result="$(wait_for_command_result "${command_id}")"
  CURRENT_STOPPED_WORKER=""
  append_summary "| \`${worker}\` | \`${partitions}\` | \`${command_id}\` | statusCode 200 |"
  echo "${worker} recovered queued command ${command_id}: ${result}"
done < <(worker_plan)

append_summary \
  '' \
  'Rollback procedure: redeploy the recorded rollback source SHA through the same environment workflow, or pin both orchestrator API and worker services to its immutable image tag before recreating those services.'

echo "orchestrator worker recovery verification passed"
