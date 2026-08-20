#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/apps/web/.env.local"
HOSTED_PORT="${HOSTED_SITES_PORT:-$((3100 + (RANDOM % 1000)))}"
ORCHESTRATOR_PORT="${HOSTED_ORCHESTRATOR_PORT:-$((4100 + (RANDOM % 1000)))}"
WEB_PORT="${AGENTBENCH_WEB_PORT:-$((5100 + (RANDOM % 1000)))}"
HOSTED_BASE_URL="${HOSTED_SITES_PUBLIC_URL:-http://127.0.0.1:${HOSTED_PORT}}"
ORCHESTRATOR_BASE_URL="${HOSTED_ORCHESTRATOR_PUBLIC_URL:-http://127.0.0.1:${ORCHESTRATOR_PORT}}"
WEB_URL="${AGENTBENCH_WEB_URL:-http://127.0.0.1:${WEB_PORT}}"
SMOKE_MODE="${SMOKE_MODE:-timeout}"
START_LOCAL_SERVICES="${START_LOCAL_SERVICES:-true}"
GENERATION_SEED="${GENERATION_SEED:-}"
BENCHMARK_CASE_SLUG="${BENCHMARK_CASE_SLUG:-hosted-web-suite}"

if [[ -f "${ENV_FILE}" && -z "${DATABASE_URL:-}" && -z "${RUNNER_SHARED_SECRET:-}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

if [[ "${SMOKE_MODE}" != "full-pass" && "${SMOKE_MODE}" != "timeout" ]]; then
  echo "SMOKE_MODE must be full-pass or timeout." >&2
  exit 2
fi
if [[ "${START_LOCAL_SERVICES}" != "true" && "${START_LOCAL_SERVICES}" != "false" ]]; then
  echo "START_LOCAL_SERVICES must be true or false." >&2
  exit 2
fi
if [[ ! "${BENCHMARK_CASE_SLUG}" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "BENCHMARK_CASE_SLUG must be a lowercase hyphenated slug." >&2
  exit 2
fi

: "${DATABASE_URL:=${DATABASE_DIRECT_URL:-}}"
: "${DATABASE_URL:?DATABASE_URL or DATABASE_DIRECT_URL is required}"
: "${DATABASE_DIRECT_URL:=${DATABASE_URL}}"
: "${RUNNER_SHARED_SECRET:?RUNNER_SHARED_SECRET is required}"

cleanup() {
  terminate_tree() {
    local parent="$1"
    local child
    while read -r child; do
      if [[ -n "${child}" ]]; then
        terminate_tree "${child}"
      fi
    done < <(pgrep -P "${parent}" 2>/dev/null || true)
    kill "${parent}" >/dev/null 2>&1 || true
  }

  for pid in "${WEB_PID:-}" "${ORCHESTRATOR_PID:-}" "${HOSTED_PID:-}"; do
    if [[ -n "${pid}" ]]; then
      terminate_tree "${pid}"
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT

if [[ "${START_LOCAL_SERVICES}" == "true" ]]; then
  DATABASE_URL="${DATABASE_URL}" \
  HOSTED_ORCHESTRATOR_URL="${ORCHESTRATOR_BASE_URL}" \
  HOSTED_SITES_URL="${HOSTED_BASE_URL}" \
  RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
  pnpm --filter web exec next dev --hostname 127.0.0.1 --port "${WEB_PORT}" \
    >/tmp/agentbench-web-smoke.log 2>&1 &
  WEB_PID=$!

  HOSTED_ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT}" \
  HOSTED_ORCHESTRATOR_PUBLIC_URL="${ORCHESTRATOR_BASE_URL}" \
  HOSTED_SITES_URL="${HOSTED_BASE_URL}" \
  AGENTBENCH_WEB_URL="${WEB_URL}" \
  DATABASE_URL="${DATABASE_URL}" \
  RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
  pnpm --filter hosted-orchestrator exec tsx src/server.ts >/tmp/agentbench-hosted-orchestrator-smoke.log 2>&1 &
  ORCHESTRATOR_PID=$!

  HOSTED_SITES_PORT="${HOSTED_PORT}" \
  HOSTED_SITES_PUBLIC_URL="${HOSTED_BASE_URL}" \
  HOSTED_ORCHESTRATOR_URL="${ORCHESTRATOR_BASE_URL}" \
  AGENTBENCH_WEB_URL="${WEB_URL}" \
  RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
  HOSTED_SCORE_PREVIEW_MODE="dev" \
  pnpm --filter hosted-sites exec tsx src/server.ts >/tmp/agentbench-hosted-sites-smoke.log 2>&1 &
  HOSTED_PID=$!
fi

for _ in $(seq 1 30); do
  if curl -fsS "${WEB_URL}/api/health" >/dev/null \
    && curl -fsS "${HOSTED_BASE_URL}/health" >/dev/null \
    && curl -fsS "${ORCHESTRATOR_BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "${WEB_URL}/api/health" >/dev/null
curl -fsS "${HOSTED_BASE_URL}/health" >/dev/null
curl -fsS "${ORCHESTRATOR_BASE_URL}/health" >/dev/null

set +e
SMOKE_MODE="${SMOKE_MODE}" \
GENERATION_SEED="${GENERATION_SEED}" \
BENCHMARK_CASE_SLUG="${BENCHMARK_CASE_SLUG}" \
ROOT_DIR="${ROOT_DIR}" \
HOSTED_BASE_URL="${HOSTED_BASE_URL}" \
ORCHESTRATOR_BASE_URL="${ORCHESTRATOR_BASE_URL}" \
WEB_URL="${WEB_URL}" \
DATABASE_DIRECT_URL="${DATABASE_DIRECT_URL}" \
pnpm --filter @agentbench/database exec node <<'NODE'
const { existsSync } = await import("node:fs");
const { pathToFileURL } = await import("node:url");

const smokeMode = process.env.SMOKE_MODE;
const generationSeed = process.env.GENERATION_SEED || undefined;
const benchmarkCaseSlug = process.env.BENCHMARK_CASE_SLUG || "hosted-web-suite";
const rootDir = process.env.ROOT_DIR;
const hostedBaseUrl = process.env.HOSTED_BASE_URL;
const orchestratorBaseUrl = process.env.ORCHESTRATOR_BASE_URL;
const webUrl = process.env.WEB_URL;
const runnerSecret = process.env.RUNNER_SHARED_SECRET;
const databaseUrl = process.env.DATABASE_DIRECT_URL;
const { Client } = await import("pg");
const database = new Client({ connectionString: databaseUrl, application_name: "agentbench-lifecycle-smoke" });
await database.connect();

function isRecoverableFault(status, body) {
  return [409, 503].includes(status) && body.includes(">Retry</a>");
}

async function checkedFetch(url, init = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    const body = await response.text();
    if (isRecoverableFault(response.status, body) && attempt === 0) continue;
    throw new Error(
      `${init.method ?? "GET"} ${new URL(url).pathname} failed with HTTP ${response.status}: ${body}`,
    );
  }
  throw new Error(`${init.method ?? "GET"} ${new URL(url).pathname} exhausted its recovery retry.`);
}

async function orchestratorRequest(path, init = {}) {
  const baseUrl = orchestratorBaseUrl.endsWith("/") ? orchestratorBaseUrl : `${orchestratorBaseUrl}/`;
  return checkedFetch(new URL(path.replace(/^\/+/, ""), baseUrl), {
    ...init,
    headers: {
      ...init.headers,
      "x-runner-secret": runnerSecret,
    },
  });
}

async function selectRows(text, values = []) {
  return (await database.query(text, values)).rows;
}

async function postForm(path, token, values) {
  const formUrl = `${hostedBaseUrl}${path}?session=${encodeURIComponent(token)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // Follow redirects explicitly. A successful mutation can redirect to a GET
    // that receives a deterministic navigation fault; replaying the original
    // POST would duplicate the already-applied mutation.
    const response = await fetch(formUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`POST ${path} redirected without a Location header.`);
      return checkedFetch(new URL(location, formUrl));
    }
    if (response.ok) return response;
    const body = await response.text();
    if (isRecoverableFault(response.status, body) && attempt === 0) continue;
    throw new Error(`POST ${path} failed with HTTP ${response.status}: ${body}`);
  }
  throw new Error(`POST ${path} exhausted its recovery retry.`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function normalizedSessions(benchmarkCase) {
  const metadata = requireObject(benchmarkCase.metadata, "benchmark metadata");
  if (!Array.isArray(metadata.sessions) || metadata.sessions.length < 2) {
    throw new Error("Hosted smoke requires at least two benchmark sessions.");
  }

  return {
    suiteSlug: requireString(metadata.suiteSlug, "suiteSlug"),
    suiteVersion: requireString(metadata.suiteVersion, "suiteVersion"),
    sessions: [...metadata.sessions]
      .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
      .map((session, sequenceIndex) => ({
        ...session,
        sequenceIndex,
        taskVersion: session.taskVersion ?? "v1",
        weight: session.weight ?? 1,
        required: session.required ?? true,
        title: session.title ?? benchmarkCase.title,
        goal: session.goal ?? benchmarkCase.description,
        startPath: session.startPath ?? null,
        seedVersion: session.seedVersion ?? `${session.app}-v1`,
        metadata: session.metadata ?? {},
      })),
  };
}

function minimumFullPassScore(manifest) {
  if (!("capabilityMatrix" in manifest)) return 1;
  const matrix = requireObject(manifest.capabilityMatrix, "capability matrix");
  if (!Array.isArray(matrix.dimensions)) {
    throw new Error("Capability matrix dimensions must be an array.");
  }
  const optionalWeight = matrix.dimensions.reduce((sum, value, index) => {
    const dimension = requireObject(value, `capability dimension ${index}`);
    if (dimension.required !== false) return sum;
    if (typeof dimension.weight !== "number" || !Number.isFinite(dimension.weight)) {
      throw new Error(`Capability dimension ${index} weight must be finite.`);
    }
    return sum + dimension.weight;
  }, 0);
  return Number((1 - optionalWeight).toFixed(4));
}

function generatedConfig(sessionRows, sequenceIndex) {
  const session = sessionRows.find((candidate) => candidate.sequence_index === sequenceIndex);
  const generation = requireObject(
    requireObject(session?.metadata, `session ${sequenceIndex} metadata`).questionGeneration,
    `session ${sequenceIndex} questionGeneration`,
  );
  requireString(generation.variantId, `session ${sequenceIndex} variantId`);
  requireString(generation.uiVariant, `session ${sequenceIndex} uiVariant`);
  requireString(generation.uiTheme, `session ${sequenceIndex} uiTheme`);
  return requireObject(generation.taskConfig, `session ${sequenceIndex} taskConfig`);
}

const appCompletion = new Map();
const completionContext = {};

async function loadAppDriver(app) {
  if (appCompletion.has(app)) {
    return appCompletion.get(app);
  }
  const driverPath = `${rootDir}/apps/hosted-sites/src/apps/${app}/test-driver.mjs`;
  if (!existsSync(driverPath)) {
    throw new Error(`Smoke completion driver is missing for app ${app}: ${driverPath}`);
  }
  const driver = await import(pathToFileURL(driverPath).href);
  if (typeof driver.complete !== "function") {
    throw new Error(`Smoke completion driver for app ${app} must export complete().`);
  }
  appCompletion.set(app, driver.complete);
  return driver.complete;
}

async function completeAndVerifySession(session, config) {
  const completeApp = await loadAppDriver(session.app);
  await completeApp({
    session,
    config,
    context: completionContext,
    hostedBaseUrl,
    checkedFetch,
    postForm,
    requireString,
    requireObject,
  });

  const score = await (
    await checkedFetch(`${hostedBaseUrl}/api/sessions/${encodeURIComponent(session.token)}/score`)
  ).json();
  if (score.status !== "passed" || score.score !== 1) {
    throw new Error(`${session.app} score failed: ${JSON.stringify(score)}`);
  }

  const completeUrl = `${hostedBaseUrl}/api/sessions/${encodeURIComponent(session.token)}/complete`;
  const firstCompletion = await (await checkedFetch(completeUrl, { method: "POST" })).json();
  const duplicateCompletion = await (await checkedFetch(completeUrl, { method: "POST" })).json();
  if (JSON.stringify(firstCompletion) !== JSON.stringify(duplicateCompletion)) {
    throw new Error(`${session.app} duplicate completion returned a different result.`);
  }
}

async function loadAttemptState(attemptId) {
  return (
    await orchestratorRequest(`/api/attempts/${encodeURIComponent(attemptId)}/state`)
  ).json();
}

async function main() {
  const publicCases = await (await checkedFetch(`${webUrl}/api/benchmark-cases`)).json();
  const publicBenchmarkCase = Array.isArray(publicCases.cases)
    ? publicCases.cases.find((candidate) => candidate.slug === benchmarkCaseSlug)
    : null;
  if (!publicBenchmarkCase) {
    throw new Error(`benchmark case not found: ${benchmarkCaseSlug}`);
  }
  const benchmarkCases = await selectRows(
    `select id, slug, title, description, current_revision_id
       from benchmark_cases
      where id = $1 and slug = $2
      limit 1`,
    [publicBenchmarkCase.id, benchmarkCaseSlug],
  );
  if (benchmarkCases.length !== 1) throw new Error("public benchmark case is not persisted");
  const benchmarkCase = benchmarkCases[0];
  const caseRevisionId = requireString(benchmarkCase.current_revision_id, "current benchmark revision");
  const revisions = await selectRows(
    `select id, case_id, manifest
       from benchmark_case_revisions
      where id = $1 and case_id = $2
      limit 1`,
    [caseRevisionId, benchmarkCase.id],
  );
  if (revisions.length !== 1) {
    throw new Error("current benchmark revision not found");
  }
  const revision = revisions[0];
  const revisionManifest = requireObject(revision.manifest, "benchmark revision manifest");
  const suite = normalizedSessions({ ...benchmarkCase, metadata: revisionManifest });

  const createdRun = await (
    await checkedFetch(`${webUrl}/api/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AgentBench lifecycle smoke",
      },
      body: JSON.stringify({
        caseId: benchmarkCase.id,
        executionMode: "external-agent",
        isPublic: false,
        ...(generationSeed ? { caseRevisionId, generationSeed } : {}),
      }),
    })
  ).json();
  const run = requireObject(createdRun.run, "created benchmark run");
  requireString(run.id, "created benchmark run id");

  const initialized = await (
    await orchestratorRequest("/api/attempts/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: run.id,
        caseId: benchmarkCase.id,
        caseRevisionId,
        callbackSecret: runnerSecret,
        generationSeed,
      }),
    })
  ).json();

  if (initialized.sessions.length !== suite.sessions.length) {
    throw new Error(`Expected ${suite.sessions.length} initialized sessions, got ${initialized.sessions.length}.`);
  }
  const attempts = await selectRows(
    `select id, case_revision_id, metadata
       from benchmark_attempts
      where id = $1
      limit 1`,
    [initialized.attemptId],
  );
  if (attempts.length !== 1 || attempts[0].case_revision_id !== caseRevisionId) {
    throw new Error("Initialized attempt did not retain the selected benchmark revision.");
  }
  const attemptMetadata = requireObject(attempts[0].metadata, "attempt metadata");
  if ("sessions" in attemptMetadata) {
    throw new Error("Attempt metadata must not duplicate generated session definitions.");
  }
  for (const privateKey of ["questionVariants", "taskConfig", "canonicalValue"]) {
    if (JSON.stringify(attemptMetadata).includes(privateKey)) {
      throw new Error(`Attempt metadata leaked private session field: ${privateKey}`);
    }
  }
  const sessions = [...initialized.sessions].sort(
    (left, right) => left.sequenceIndex - right.sequenceIndex,
  );
  const sessionRows = await selectRows(
    `select id, sequence_index, metadata
       from hosted_web_sessions
      where attempt_id = $1`,
    [initialized.attemptId],
  );
  if (sessionRows.length !== sessions.length) {
    throw new Error("Hosted session metadata rows were not persisted for every initialized session.");
  }
  const initialState = await loadAttemptState(initialized.attemptId);
  if (initialState.activeSessionId !== sessions[0].sessionId) {
    throw new Error("The first generated session is not active.");
  }

  const initialAdvance = await (
    await orchestratorRequest(
      `/api/attempts/${encodeURIComponent(initialized.attemptId)}/commands/resolve-advance`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentSessionId: sessions[0].sessionId }),
      },
    )
  ).json();
  if (initialAdvance.complete || initialAdvance.nextSessionId !== sessions[0].sessionId) {
    throw new Error("Initial advance did not return the active session.");
  }

  const completedSessions = [];
  const completionCount = smokeMode === "full-pass" ? sessions.length : 1;
  for (const session of sessions.slice(0, completionCount)) {
    await completeAndVerifySession(session, generatedConfig(sessionRows, session.sequenceIndex));
    completedSessions.push(session.sessionId);
  }

  if (smokeMode === "timeout") {
    const state = await loadAttemptState(initialized.attemptId);
    const expiredSession = state.sessions.find((session) => session.id === state.activeSessionId);
    if (!expiredSession) {
      throw new Error("Timeout smoke could not find the next active session.");
    }
    const timeout = await (
      await orchestratorRequest(
        `/api/attempts/${encodeURIComponent(initialized.attemptId)}/commands/timeout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: run.id,
            expiredSessionId: expiredSession.id,
            expiredTaskSlug: expiredSession.taskSlug,
          }),
        },
      )
    ).json();
    if (!timeout.ok || typeof timeout.summary !== "string" || timeout.summary.length === 0) {
      throw new Error("Timeout command did not return a usable summary.");
    }
    const finalState = await loadAttemptState(initialized.attemptId);
    if (finalState.activeSessionId !== null) {
      throw new Error("Timed out attempt retained an active session.");
    }
  } else {
    const finalState = await loadAttemptState(initialized.attemptId);
    if (
      finalState.activeSessionId !== null ||
      finalState.completedSessionIds.length !== sessions.length
    ) {
      throw new Error("Completed attempt has inconsistent terminal state.");
    }
    const finalAdvance = await (
      await orchestratorRequest(
        `/api/attempts/${encodeURIComponent(initialized.attemptId)}/commands/resolve-advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentSessionId: sessions.at(-1).sessionId }),
        },
      )
    ).json();
    if (!finalAdvance.complete || finalAdvance.nextSessionId !== null || finalAdvance.nextStartUrl !== null) {
      throw new Error("Final advance did not report suite completion.");
    }
  }

  const resultRows = await selectRows(
    "select session_id from hosted_web_results where attempt_id = $1",
    [initialized.attemptId],
  );
  if (
    resultRows.length !== completedSessions.length ||
    new Set(resultRows.map((row) => row.session_id)).size !== resultRows.length
  ) {
    throw new Error("Hosted result rows are not unique per completed session.");
  }

  const scoreRows = await selectRows(
    "select id, status, score from benchmark_attempt_scores where attempt_id = $1",
    [initialized.attemptId],
  );
  if (scoreRows.length !== 1) {
    throw new Error(`Expected one aggregate attempt score, got ${scoreRows.length}.`);
  }
  const aggregateScore = Number(scoreRows[0].score);
  const minimumScore = minimumFullPassScore(revisionManifest);
  if (
    smokeMode === "full-pass"
    && (
      scoreRows[0].status !== "passed"
      || !Number.isFinite(aggregateScore)
      || aggregateScore < minimumScore
      || aggregateScore > 1
    )
  ) {
    throw new Error(
      `Expected a passing aggregate score in [${minimumScore}, 1], got ${JSON.stringify(scoreRows[0])}.`,
    );
  }

  const selectedVariants = sessionRows
    .sort((left, right) => left.sequence_index - right.sequence_index)
    .map((session) => {
      const generation = requireObject(
        requireObject(session.metadata, `session ${session.sequence_index} metadata`).questionGeneration,
        `session ${session.sequence_index} questionGeneration`,
      );
      return `${sessions.find((candidate) => candidate.sessionId === session.id)?.app ?? "unknown"}:${generation.variantId}`;
    })
    .join(",");
  console.log(
    `orchestrator smoke (${smokeMode}) passed: case=${benchmarkCaseSlug} suite=${suite.suiteSlug}@${suite.suiteVersion} run=${run.id} attempt=${initialized.attemptId} sessions=${sessions.length} variants=${selectedVariants}`,
  );
}

main().then(async () => {
  await database.end();
  process.exit(0);
}).catch(async (error) => {
  await database.end().catch(() => undefined);
  console.error(error);
  process.exit(1);
});
NODE
node_status=$?
set -e
cleanup
trap - EXIT
exit "${node_status}"
