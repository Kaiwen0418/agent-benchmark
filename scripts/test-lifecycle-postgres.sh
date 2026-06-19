#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="agentbench-lifecycle-postgres-$RANDOM"
PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  rm -f /tmp/agentbench-completion-race-*.json /tmp/agentbench-timeout-race-*.json
}
trap cleanup EXIT

docker run -d --rm --name "${CONTAINER}" \
  -e POSTGRES_PASSWORD=postgres \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
"${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc 'select 1' >/dev/null

"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon;
create role authenticated;
create role service_role;

create table public.benchmark_attempts (
  id uuid primary key,
  run_id uuid not null,
  status text not null,
  aggregate_score numeric,
  metadata jsonb not null default '{}'::jsonb,
  scoring_summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz
);
create table public.hosted_web_sessions (
  id uuid primary key,
  run_id uuid not null,
  attempt_id uuid not null references public.benchmark_attempts(id),
  app text not null,
  task_slug text not null,
  weight numeric not null default 1,
  status text not null,
  activated_at timestamptz,
  completed_at timestamptz
);
create table public.hosted_web_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hosted_web_sessions(id),
  run_id uuid not null,
  attempt_id uuid not null references public.benchmark_attempts(id),
  app text,
  task_slug text,
  weight numeric not null default 1,
  status text not null,
  score numeric not null,
  summary text not null,
  final_state jsonb not null default '{}'::jsonb,
  evaluators jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id)
);
create table public.benchmark_attempt_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  attempt_id uuid not null references public.benchmark_attempts(id),
  status text not null,
  score numeric not null,
  summary text not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(attempt_id)
);
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260619000014_atomic_attempt_timeout.sql" >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260619000015_atomic_session_completion.sql" >/dev/null

seed_attempt() {
  local attempt_id="$1"
  local session_id="$2"
  local run_id="$3"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -v attempt_id="${attempt_id}" -v session_id="${session_id}" -v run_id="${run_id}" <<'SQL' >/dev/null
insert into public.benchmark_attempts (id, run_id, status, metadata)
values (:'attempt_id', :'run_id', 'running', jsonb_build_object('activeSessionId', :'session_id'));
insert into public.hosted_web_sessions (id, run_id, attempt_id, app, task_slug, status)
values (:'session_id', :'run_id', :'attempt_id', 'shopping-lite', 'shopping-constrained-checkout', 'active');
SQL
}

completion_sql() {
  local attempt_id="$1"
  local session_id="$2"
  cat <<SQL
select public.complete_hosted_attempt_session(
  '${attempt_id}',
  '${session_id}',
  now(),
  '{"status":"passed","score":1,"summary":"passed","evaluators":[],"finalState":{}}'::jsonb,
  '{"complete":true,"status":"completed","aggregate":{"status":"passed","score":1,"summary":"passed","breakdown":{"aggregation":"weighted-required-suite","sessions":[]}},"metadata":{"activeSessionId":null,"activeSequenceIndex":null,"completedSessionIds":["${session_id}"]},"scoringSummary":{"status":"passed","summary":"passed","breakdown":{"aggregation":"weighted-required-suite","sessions":[]}},"nextSessionId":null}'::jsonb
);
SQL
}

ATTEMPT_1='10000000-0000-0000-0000-000000000001'
SESSION_1='20000000-0000-0000-0000-000000000001'
RUN_1='30000000-0000-0000-0000-000000000001'
seed_attempt "${ATTEMPT_1}" "${SESSION_1}" "${RUN_1}"

"${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "$(completion_sql "${ATTEMPT_1}" "${SESSION_1}")" \
  > /tmp/agentbench-completion-race-1.json &
completion_pid=$!
"${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "select row_to_json(result) from public.timeout_hosted_attempt('${ATTEMPT_1}', now(), '${SESSION_1}', '{\"summary\":\"timeout\",\"breakdown\":{}}'::jsonb) result;" \
  > /tmp/agentbench-timeout-race-1.json &
timeout_pid=$!
wait "${completion_pid}"
wait "${timeout_pid}"

state="$("${PSQL[@]}" -Atqc "
select attempts.status || ':' || sessions.status || ':' || scores.status || ':' || count(results.id)
from public.benchmark_attempts attempts
join public.hosted_web_sessions sessions on sessions.attempt_id = attempts.id
join public.benchmark_attempt_scores scores on scores.attempt_id = attempts.id
left join public.hosted_web_results results on results.attempt_id = attempts.id
where attempts.id = '${ATTEMPT_1}'
group by attempts.status, sessions.status, scores.status;")"
if [[ "${state}" != "completed:completed:passed:1" && "${state}" != "timeout:expired:error:0" ]]; then
  echo "atomic lifecycle race produced inconsistent state: ${state}" >&2
  exit 1
fi

ATTEMPT_2='10000000-0000-0000-0000-000000000002'
SESSION_2='20000000-0000-0000-0000-000000000002'
RUN_2='30000000-0000-0000-0000-000000000002'
seed_attempt "${ATTEMPT_2}" "${SESSION_2}" "${RUN_2}"
first="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "$(completion_sql "${ATTEMPT_2}" "${SESSION_2}")")"
second="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "$(completion_sql "${ATTEMPT_2}" "${SESSION_2}")")"

[[ "${first}" == *'"transitioned": true'* ]]
[[ "${second}" == *'"duplicate": true'* ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.hosted_web_results where attempt_id = '${ATTEMPT_2}'")" == "1" ]]
[[ "$("${PSQL[@]}" -Atqc "select count(*) from public.benchmark_attempt_scores where attempt_id = '${ATTEMPT_2}'")" == "1" ]]

echo "lifecycle Postgres integration tests passed"
