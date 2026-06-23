#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if grep -En 'sessions: generatedSessions|metadata: session\.metadata|questionVariants|taskConfig|canonicalValue' \
  apps/hosted-orchestrator/src/server.ts >/tmp/agentbench-hosted-metadata-boundary.txt; then
  cat /tmp/agentbench-hosted-metadata-boundary.txt >&2
  echo "orchestrator attempt initialization must not copy private session definitions into attempt metadata" >&2
  exit 1
fi

CONTAINER="agentbench-hosted-metadata-boundaries-$RANDOM"
PSQL=(docker exec -i "${CONTAINER}" psql -h 127.0.0.1 -U postgres -d postgres)

cleanup() {
  rm -f /tmp/agentbench-hosted-metadata-boundary.txt
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
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
create table public.benchmark_attempts (
  id uuid primary key,
  provider text not null,
  metadata jsonb not null default '{}'::jsonb
);

insert into public.benchmark_attempts (id, provider, metadata) values
(
  '80000000-0000-0000-0000-000000000001',
  'hosted-web',
  '{
    "generationSeed":"seed-1",
    "sessions":[
      {
        "app":"wiki-lite",
        "metadata":{
          "questionGeneration":{
            "variantId":"release-date",
            "taskConfig":{"canonicalValue":"June 1, 2026"}
          }
        }
      }
    ],
    "activeSessionId":"session-1",
    "completedSessionIds":[]
  }'::jsonb
),
(
  '80000000-0000-0000-0000-000000000002',
  'other-provider',
  '{"sessions":[{"keep":true}]}'::jsonb
);
SQL

"${PSQL[@]}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/supabase/migrations/20260623000023_shrink_hosted_attempt_metadata.sql" >/dev/null

hosted_clean="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "
  select count(*) = 1
    and bool_and(not (metadata ? 'sessions'))
    and bool_and(metadata::text not like '%taskConfig%')
    and bool_and(metadata ->> 'generationSeed' = 'seed-1')
  from public.benchmark_attempts
  where provider = 'hosted-web';
")"
if [[ "${hosted_clean}" != "t" ]]; then
  echo "hosted attempt metadata shrink migration did not remove private session snapshots: ${hosted_clean}" >&2
  exit 1
fi

other_untouched="$("${PSQL[@]}" -v ON_ERROR_STOP=1 -Atqc "
  select metadata ? 'sessions'
  from public.benchmark_attempts
  where provider = 'other-provider';
")"
if [[ "${other_untouched}" != "t" ]]; then
  echo "metadata shrink migration changed non-hosted attempts" >&2
  exit 1
fi

echo "hosted metadata boundary tests passed"
