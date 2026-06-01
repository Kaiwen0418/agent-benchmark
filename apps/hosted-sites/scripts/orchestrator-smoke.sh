#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${ROOT_DIR}/apps/web/.env.local"
HOSTED_PORT="${HOSTED_SITES_PORT:-$((3100 + (RANDOM % 1000)))}"
ORCHESTRATOR_PORT="${HOSTED_ORCHESTRATOR_PORT:-$((4100 + (RANDOM % 1000)))}"
HOSTED_BASE_URL="${HOSTED_SITES_PUBLIC_URL:-http://127.0.0.1:${HOSTED_PORT}}"
ORCHESTRATOR_BASE_URL="${HOSTED_ORCHESTRATOR_PUBLIC_URL:-http://127.0.0.1:${ORCHESTRATOR_PORT}}"
WEB_URL="${AGENTBENCH_WEB_URL:-http://127.0.0.1:3999}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${RUNNER_SHARED_SECRET:?RUNNER_SHARED_SECRET is required}"

cleanup() {
  for pid in "${ORCHESTRATOR_PID:-}" "${HOSTED_PID:-}"; do
    if [[ -n "${pid}" ]]; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT

HOSTED_ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT}" \
HOSTED_ORCHESTRATOR_PUBLIC_URL="${ORCHESTRATOR_BASE_URL}" \
HOSTED_SITES_URL="${HOSTED_BASE_URL}" \
AGENTBENCH_WEB_URL="${WEB_URL}" \
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
pnpm --filter hosted-orchestrator exec tsx src/server.ts >/tmp/agentbench-hosted-orchestrator-smoke.log 2>&1 &
ORCHESTRATOR_PID=$!

HOSTED_SITES_PORT="${HOSTED_PORT}" \
HOSTED_SITES_PUBLIC_URL="${HOSTED_BASE_URL}" \
HOSTED_ORCHESTRATOR_URL="${ORCHESTRATOR_BASE_URL}" \
AGENTBENCH_WEB_URL="${WEB_URL}" \
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
pnpm --filter hosted-sites exec tsx src/server.ts >/tmp/agentbench-hosted-sites-smoke.log 2>&1 &
HOSTED_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "${HOSTED_BASE_URL}/health" >/dev/null && curl -fsS "${ORCHESTRATOR_BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "${HOSTED_BASE_URL}/health" >/dev/null
curl -fsS "${ORCHESTRATOR_BASE_URL}/health" >/dev/null

SETUP_JSON="$(cd "${ROOT_DIR}" && pnpm --filter hosted-sites exec node <<'NODE'
const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: benchmarkCase, error: caseError } = await supabase
    .from("benchmark_cases")
    .select("id, slug")
    .eq("slug", "shopping-constrained-checkout")
    .single();

  if (caseError || !benchmarkCase) {
    throw caseError ?? new Error("benchmark case not found");
  }

  const { data: run, error: runError } = await supabase
    .from("benchmark_runs")
    .insert({
      case_id: benchmarkCase.id,
      execution_mode: "external-agent",
      status: "queued",
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw runError ?? new Error("run creation failed");
  }

  console.log(JSON.stringify({ caseId: benchmarkCase.id, runId: run.id }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
)"

RUN_ID="$(printf '%s' "${SETUP_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).runId')"
CASE_ID="$(printf '%s' "${SETUP_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).caseId')"

INIT_PAYLOAD="$(cat <<JSON
{
  "runId": "${RUN_ID}",
  "caseId": "${CASE_ID}",
  "callbackSecret": "${RUNNER_SHARED_SECRET}",
  "suiteSlug": "hosted-web-suite-v1",
  "suiteVersion": "v1",
  "sessions": [
    {
      "app": "shopping-lite",
      "taskSlug": "shopping-constrained-checkout",
      "taskVersion": "v1",
      "sequenceIndex": 0,
      "weight": 1,
      "required": true,
      "title": "Shopping checkout",
      "goal": "Buy exactly one unrestricted charger that costs at most 30 USD and use standard shipping.",
      "startPath": "/shopping",
      "seedVersion": "shopping-lite-v1",
      "metadata": {}
    },
    {
      "app": "wiki-lite",
      "taskSlug": "wiki-release-answer",
      "taskVersion": "v1",
      "sequenceIndex": 1,
      "weight": 1,
      "required": true,
      "title": "Wiki release history",
      "goal": "Answer when wiki-lite followed the hosted-web suite alpha.",
      "startPath": "/wiki",
      "seedVersion": "wiki-lite-v1",
      "metadata": {}
    }
  ]
}
JSON
)"

INIT_JSON="$(curl -fsS -X POST "${ORCHESTRATOR_BASE_URL}/api/attempts/init" \
  -H "Content-Type: application/json" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}" \
  -d "${INIT_PAYLOAD}")"

ATTEMPT_ID="$(printf '%s' "${INIT_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).attemptId')"
FIRST_TOKEN="$(printf '%s' "${INIT_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).sessions[0].token')"
FIRST_SESSION_ID="$(printf '%s' "${INIT_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).sessions[0].sessionId')"
SECOND_SESSION_ID="$(printf '%s' "${INIT_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).sessions[1].sessionId')"

STATE_JSON="$(curl -fsS "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/state" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}")"

printf '%s' "${STATE_JSON}" | node -e '
const state = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (state.activeSessionId !== state.sessions[0].id) {
  throw new Error("unexpected initial activeSessionId");
}
if (state.sessions.length !== 2) {
  throw new Error("expected two sessions");
}
'

ADVANCE_BEFORE_JSON="$(curl -fsS -X POST "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/commands/resolve-advance" \
  -H "Content-Type: application/json" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}" \
  -d "{\"currentSessionId\":\"${FIRST_SESSION_ID}\"}")"

printf '%s' "${ADVANCE_BEFORE_JSON}" | node -e '
const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (payload.complete !== false || payload.nextSessionId !== payload.currentSessionId) {
  throw new Error("resolve-advance should point at the current active session before completion");
}
'

curl -fsS "${HOSTED_BASE_URL}/shopping?session=${FIRST_TOKEN}" >/dev/null
curl -fsS -X POST "${HOSTED_BASE_URL}/shopping/cart?session=${FIRST_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "productId=prod-charger-30w" >/dev/null
curl -fsS -X POST "${HOSTED_BASE_URL}/shopping/checkout?session=${FIRST_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "shippingMethod=standard" >/dev/null

SCORE_JSON="$(curl -fsS "${HOSTED_BASE_URL}/api/sessions/${FIRST_TOKEN}/score")"

COMPLETE_JSON="$(curl -fsS -X POST "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/commands/complete-session" \
  -H "Content-Type: application/json" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}" \
  -d "{\"sessionToken\":\"${FIRST_TOKEN}\",\"result\":${SCORE_JSON},\"finalState\":{\"source\":\"smoke\"}}")"

printf '%s' "${COMPLETE_JSON}" | node -e '
const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (payload.status !== "passed" || payload.score !== 1) {
  throw new Error("complete-session command did not return the expected duplicate pass result");
}
'

STATE_AFTER_COMPLETE_JSON="$(curl -fsS "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/state" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}")"

SECOND_TOKEN="$(printf '%s' "${STATE_AFTER_COMPLETE_JSON}" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).sessions[1].token')"

printf '%s' "${STATE_AFTER_COMPLETE_JSON}" | node -e '
const state = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (state.activeSessionId !== state.sessions[1].id) {
  throw new Error("second session should become active after shopping completion");
}
'

ADVANCE_AFTER_JSON="$(curl -fsS -X POST "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/commands/resolve-advance" \
  -H "Content-Type: application/json" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}" \
  -d "{\"currentSessionId\":\"${FIRST_SESSION_ID}\"}")"

printf '%s' "${ADVANCE_AFTER_JSON}" | node -e '
const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (payload.complete !== false || !payload.nextStartUrl || !payload.nextStartUrl.includes("/wiki?session=")) {
  throw new Error("resolve-advance should point to the wiki session after shopping completion");
}
'

TIMEOUT_JSON="$(curl -fsS -X POST "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/commands/timeout" \
  -H "Content-Type: application/json" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}" \
  -d "{\"runId\":\"${RUN_ID}\",\"expiredSessionId\":\"${SECOND_SESSION_ID}\",\"expiredTaskSlug\":\"wiki-release-answer\"}")"

printf '%s' "${TIMEOUT_JSON}" | node -e '
const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (!payload.ok || typeof payload.summary !== "string" || payload.summary.length === 0) {
  throw new Error("timeout command did not return a usable summary");
}
'

FINAL_STATE_JSON="$(curl -fsS "${ORCHESTRATOR_BASE_URL}/api/attempts/${ATTEMPT_ID}/state" \
  -H "x-runner-secret: ${RUNNER_SHARED_SECRET}")"

printf '%s' "${FINAL_STATE_JSON}" | node -e '
const state = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (state.activeSessionId !== null) {
  throw new Error("timed out attempt should not retain an active session");
}
'

echo "orchestrator smoke passed: run=${RUN_ID} attempt=${ATTEMPT_ID}"
