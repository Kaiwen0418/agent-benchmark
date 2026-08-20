#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_EXECUTOR="${DATABASE_EXECUTOR:-${ROOT_DIR}/scripts/lib/exec-postgres-url.py}"
CUTOVER_PHASE="${CUTOVER_PHASE:-preflight}"
DATABASE_DIRECT_URL="${DATABASE_DIRECT_URL:-}"
EXPECTED_DATABASE_NAME="${EXPECTED_DATABASE_NAME:-}"

case "${CUTOVER_PHASE}" in
  preflight | postcutover)
    ;;
  *)
    echo "CUTOVER_PHASE must be preflight or postcutover." >&2
    exit 1
    ;;
esac

if [[ -z "${DATABASE_DIRECT_URL}" || -z "${EXPECTED_DATABASE_NAME}" ]]; then
  echo "DATABASE_DIRECT_URL and EXPECTED_DATABASE_NAME are required." >&2
  exit 1
fi

if [[ ! "${EXPECTED_DATABASE_NAME}" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "EXPECTED_DATABASE_NAME contains unsafe characters." >&2
  exit 1
fi

query="
select concat_ws('|',
  current_database(),
  (select count(*) from public.benchmark_runs
    where status not in ('completed', 'failed', 'cancelled', 'timeout')),
  (select count(*) from public.hosted_callback_outbox
    where status in ('pending', 'delivering')),
  (select count(*) from public.hosted_callback_outbox where status = 'dead'),
  (select numbackends from pg_stat_database where datname = current_database()),
  (
    to_regclass('public.benchmark_runs') is not null
    and to_regclass('public.hosted_web_sessions') is not null
    and to_regclass('public.hosted_callback_outbox') is not null
    and to_regclass('public.orchestrator_command_dead_letters') is not null
    and to_regclass('public.public_hosted_run_summaries') is not null
    and to_regclass('public.public_hosted_run_tasks') is not null
    and to_regprocedure('public.complete_hosted_attempt_session(uuid,uuid,timestamp with time zone,jsonb,jsonb)') is not null
    and to_regprocedure('public.timeout_hosted_attempt(uuid,timestamp with time zone,uuid,jsonb)') is not null
  )
);"

database_evidence="$(DATABASE_COMMAND_URL="${DATABASE_DIRECT_URL}" \
  "${DATABASE_EXECUTOR}" psql -X -v ON_ERROR_STOP=1 -Atqc "${query}")"
IFS='|' read -r database_name active_runs callback_backlog dead_callbacks database_connections schema_valid \
  <<< "${database_evidence}"

if [[ "${database_name}" != "${EXPECTED_DATABASE_NAME}" ]]; then
  echo "Database identity mismatch: expected ${EXPECTED_DATABASE_NAME}, received ${database_name}." >&2
  exit 1
fi
if [[ "${active_runs}" != "0" ]]; then
  echo "Cutover blocked by ${active_runs} active benchmark runs." >&2
  exit 1
fi
if [[ "${callback_backlog}" != "0" ]]; then
  echo "Cutover blocked by ${callback_backlog} pending or delivering callbacks." >&2
  exit 1
fi
if [[ "${schema_valid}" != "true" && "${schema_valid}" != "t" ]]; then
  echo "Cutover database is missing required tables, views, or lifecycle functions." >&2
  exit 1
fi

web_health="not-checked"
hosted_health="not-checked"
orchestrator_health="not-checked"
runtime_containers="not-checked"
redis_pending="not-checked"
redis_lag="not-checked"

if [[ "${CUTOVER_PHASE}" == "postcutover" ]]; then
  required_runtime_variables=(
    AGENTBENCH_WEB_URL
    HOSTED_ORCHESTRATOR_PUBLIC_URL
    HOSTED_SITES_PUBLIC_URL
  )
  for variable in "${required_runtime_variables[@]}"; do
    if [[ -z "${!variable:-}" ]]; then
      echo "${variable} is required for postcutover verification." >&2
      exit 1
    fi
  done

  curl -fsS "${AGENTBENCH_WEB_URL%/}/api/health" >/dev/null
  web_health="ok"
  curl -fsS "${HOSTED_SITES_PUBLIC_URL%/}/health" >/dev/null
  hosted_health="ok"
  curl -fsS "${HOSTED_ORCHESTRATOR_PUBLIC_URL%/}" >/dev/null
  orchestrator_health="ok"

  expected_projects=(agentbench-development agentbench-development-web)
  running_count=0
  total_count=0
  for project in "${expected_projects[@]}"; do
    project_containers="$(docker ps -aq --filter "label=com.docker.compose.project=${project}")"
    project_total="$(wc -w <<< "${project_containers}" | tr -d ' ')"
    project_running="$(docker ps -q --filter "label=com.docker.compose.project=${project}" | wc -l | tr -d ' ')"
    if [[ "${project_total}" == "0" || "${project_running}" != "${project_total}" ]]; then
      echo "Compose project ${project} is absent or has stopped containers (${project_running}/${project_total} running)." >&2
      exit 1
    fi
    for container in ${project_containers}; do
      container_health="$(docker inspect "${container}" \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
      if [[ "${container_health}" == "unhealthy" ]]; then
        echo "Compose project ${project} contains an unhealthy container." >&2
        exit 1
      fi
    done
    running_count=$((running_count + project_running))
    total_count=$((total_count + project_total))
  done
  runtime_containers="${running_count}/${total_count}"

  redis_container="$(docker ps -q \
    --filter 'label=com.docker.compose.project=agentbench-development' \
    --filter 'label=com.docker.compose.service=orchestrator-redis')"
  if [[ -z "${redis_container}" ]]; then
    echo "Development orchestrator Redis container is not running." >&2
    exit 1
  fi

  redis_pending=0
  redis_lag=0
  for partition in $(seq 0 15); do
    group_info="$(docker exec "${redis_container}" redis-cli --raw XINFO GROUPS \
      "agentbench:orchestrator:commands:p${partition}")"
    partition_pending="$(awk '$0 == "pending" { getline; print; exit }' <<< "${group_info}")"
    partition_lag="$(awk '$0 == "lag" { getline; print; exit }' <<< "${group_info}")"
    if [[ ! "${partition_pending}" =~ ^[0-9]+$ || ! "${partition_lag}" =~ ^[0-9]+$ ]]; then
      echo "Unable to read Redis consumer-group evidence for partition ${partition}." >&2
      exit 1
    fi
    redis_pending=$((redis_pending + partition_pending))
    redis_lag=$((redis_lag + partition_lag))
  done
  if [[ "${redis_pending}" != "0" || "${redis_lag}" != "0" ]]; then
    echo "Post-cutover Redis backlog is not drained: pending=${redis_pending} lag=${redis_lag}." >&2
    exit 1
  fi
fi

cat <<EOF
cutover_phase=${CUTOVER_PHASE}
database_name=${database_name}
active_runs=${active_runs}
callback_backlog=${callback_backlog}
dead_callbacks=${dead_callbacks}
database_connections=${database_connections}
schema_valid=${schema_valid}
web_health=${web_health}
hosted_health=${hosted_health}
orchestrator_health=${orchestrator_health}
runtime_containers=${runtime_containers}
redis_pending=${redis_pending}
redis_lag=${redis_lag}
verified_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
