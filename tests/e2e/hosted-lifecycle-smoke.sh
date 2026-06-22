#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/apps/web/.env.local"
HOSTED_PORT="${HOSTED_SITES_PORT:-$((3100 + (RANDOM % 1000)))}"
ORCHESTRATOR_PORT="${HOSTED_ORCHESTRATOR_PORT:-$((4100 + (RANDOM % 1000)))}"
HOSTED_BASE_URL="${HOSTED_SITES_PUBLIC_URL:-http://127.0.0.1:${HOSTED_PORT}}"
ORCHESTRATOR_BASE_URL="${HOSTED_ORCHESTRATOR_PUBLIC_URL:-http://127.0.0.1:${ORCHESTRATOR_PORT}}"
WEB_URL="${AGENTBENCH_WEB_URL:-http://127.0.0.1:3999}"
SMOKE_MODE="${SMOKE_MODE:-timeout}"
START_LOCAL_SERVICES="${START_LOCAL_SERVICES:-true}"
GENERATION_SEED="${GENERATION_SEED:-}"

if [[ -f "${ENV_FILE}" && -z "${SUPABASE_URL:-}" && -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -z "${RUNNER_SHARED_SECRET:-}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${RUNNER_SHARED_SECRET:?RUNNER_SHARED_SECRET is required}"

if [[ "${SMOKE_MODE}" != "full-pass" && "${SMOKE_MODE}" != "timeout" ]]; then
  echo "SMOKE_MODE must be full-pass or timeout." >&2
  exit 2
fi
if [[ "${START_LOCAL_SERVICES}" != "true" && "${START_LOCAL_SERVICES}" != "false" ]]; then
  echo "START_LOCAL_SERVICES must be true or false." >&2
  exit 2
fi

cleanup() {
  for pid in "${ORCHESTRATOR_PID:-}" "${HOSTED_PID:-}"; do
    if [[ -n "${pid}" ]]; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT

if [[ "${START_LOCAL_SERVICES}" == "true" ]]; then
  HOSTED_ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT}" \
  HOSTED_ORCHESTRATOR_PUBLIC_URL="${ORCHESTRATOR_BASE_URL}" \
  HOSTED_SITES_URL="${HOSTED_BASE_URL}" \
  AGENTBENCH_WEB_URL="${WEB_URL}" \
  SUPABASE_URL="${SUPABASE_URL}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
  pnpm --filter hosted-orchestrator exec tsx src/server.ts >/tmp/agentbench-hosted-orchestrator-smoke.log 2>&1 &
  ORCHESTRATOR_PID=$!

  HOSTED_SITES_PORT="${HOSTED_PORT}" \
  HOSTED_SITES_PUBLIC_URL="${HOSTED_BASE_URL}" \
  HOSTED_ORCHESTRATOR_URL="${ORCHESTRATOR_BASE_URL}" \
  AGENTBENCH_WEB_URL="${WEB_URL}" \
  RUNNER_SHARED_SECRET="${RUNNER_SHARED_SECRET}" \
  pnpm --filter hosted-sites exec tsx src/server.ts >/tmp/agentbench-hosted-sites-smoke.log 2>&1 &
  HOSTED_PID=$!
fi

for _ in $(seq 1 30); do
  if curl -fsS "${HOSTED_BASE_URL}/health" >/dev/null && curl -fsS "${ORCHESTRATOR_BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "${HOSTED_BASE_URL}/health" >/dev/null
curl -fsS "${ORCHESTRATOR_BASE_URL}/health" >/dev/null

SMOKE_MODE="${SMOKE_MODE}" \
GENERATION_SEED="${GENERATION_SEED}" \
HOSTED_BASE_URL="${HOSTED_BASE_URL}" \
ORCHESTRATOR_BASE_URL="${ORCHESTRATOR_BASE_URL}" \
node <<'NODE'
const smokeMode = process.env.SMOKE_MODE;
const generationSeed = process.env.GENERATION_SEED || undefined;
const hostedBaseUrl = process.env.HOSTED_BASE_URL;
const orchestratorBaseUrl = process.env.ORCHESTRATOR_BASE_URL;
const runnerSecret = process.env.RUNNER_SHARED_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkedFetch(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${new URL(url).pathname} failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
  return response;
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

async function supabaseRequest(table, searchParams, init = {}) {
  const query = new URLSearchParams(searchParams);
  return checkedFetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function selectRows(table, searchParams) {
  return (await supabaseRequest(table, searchParams)).json();
}

async function insertRow(table, value) {
  const rows = await (
    await supabaseRequest(table, { select: "id" }, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(value),
    })
  ).json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Expected one inserted ${table} row.`);
  }
  return rows[0];
}

async function postForm(path, token, values) {
  return checkedFetch(`${hostedBaseUrl}${path}?session=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
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

function generatedConfig(initialized, sequenceIndex) {
  const session = initialized.metadata.sessions.find(
    (candidate) => candidate.sequenceIndex === sequenceIndex,
  );
  const generation = requireObject(
    requireObject(session?.metadata, `session ${sequenceIndex} metadata`).questionGeneration,
    `session ${sequenceIndex} questionGeneration`,
  );
  requireString(generation.variantId, `session ${sequenceIndex} variantId`);
  requireString(generation.uiVariant, `session ${sequenceIndex} uiVariant`);
  requireString(generation.uiTheme, `session ${sequenceIndex} uiTheme`);
  return requireObject(generation.taskConfig, `session ${sequenceIndex} taskConfig`);
}

async function completeShopping(session, config) {
  const productByCategory = {
    charger: "prod-charger-30w",
    cable: "prod-cable-1m",
    case: "prod-case",
  };
  const productId = productByCategory[config.targetCategory];
  if (!productId) {
    throw new Error(`Unsupported shopping category: ${config.targetCategory}`);
  }
  const quantity = Number(config.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invalid shopping quantity: ${config.quantity}`);
  }

  await checkedFetch(session.startUrl);
  for (let count = 0; count < quantity; count += 1) {
    await postForm("/shopping/cart", session.token, { productId });
  }
  await postForm("/shopping/checkout", session.token, {
    shippingMethod: requireString(config.shippingMethod, "shopping shippingMethod"),
  });
}

async function completeForum(session, config) {
  const threadId = requireString(config.targetThreadId, "forum targetThreadId");
  await checkedFetch(`${hostedBaseUrl}/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
  await postForm(`/forum/thread/${encodeURIComponent(threadId)}/reply`, session.token, {
    body: requireString(config.expectedReplyValue, "forum expectedReplyValue"),
  });
  await postForm(`/forum/thread/${encodeURIComponent(threadId)}/lock`, session.token, {
    reason: requireString(config.expectedLockReason, "forum expectedLockReason"),
  });
}

async function completeRepo(session, config) {
  const filePath = requireString(config.filePath, "repo filePath");
  const expectedText = requireString(config.expectedText, "repo expectedText");
  const content = [
    "# Demo Project",
    "",
    "## Install",
    "",
    `Run \`${expectedText}\` to install dependencies.`,
    "",
    "## Usage",
    "",
    "Start the dev server with `npm run dev`.",
    "",
  ].join("\n");
  await checkedFetch(`${hostedBaseUrl}/repo/file/${encodeURIComponent(filePath)}/edit?session=${encodeURIComponent(session.token)}`);
  await postForm(`/repo/file/${encodeURIComponent(filePath)}/edit`, session.token, { content });
  await postForm("/repo/mr/new", session.token, {
    title: requireString(config.expectedMrTitle, "repo expectedMrTitle"),
    targetBranch: requireString(config.expectedTargetBranch, "repo expectedTargetBranch"),
  });
}

async function completeWiki(session, config) {
  const articleSlug = requireString(config.targetArticleSlug, "wiki targetArticleSlug");
  const answerContract = requireObject(config.answerContract, "wiki answerContract");
  await checkedFetch(`${hostedBaseUrl}/wiki/article/${encodeURIComponent(articleSlug)}?session=${encodeURIComponent(session.token)}`);
  await postForm("/wiki/answer", session.token, {
    answer: requireString(answerContract.canonicalValue, "wiki canonicalValue"),
  });
}

const appCompletion = {
  "shopping-lite": completeShopping,
  "forum-lite": completeForum,
  "repo-lite": completeRepo,
  "wiki-lite": completeWiki,
};

async function completeAndVerifySession(session, config) {
  const completeApp = appCompletion[session.app];
  if (!completeApp) {
    throw new Error(`Smoke completion is not implemented for app ${session.app}.`);
  }
  await completeApp(session, config);

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
  const benchmarkCases = await selectRows("benchmark_cases", {
    select: "id,slug,title,description,current_revision_id",
    slug: "eq.hosted-web-suite",
    limit: "1",
  });
  if (!Array.isArray(benchmarkCases) || benchmarkCases.length !== 1) {
    throw new Error("benchmark case not found");
  }
  const benchmarkCase = benchmarkCases[0];
  const caseRevisionId = requireString(benchmarkCase.current_revision_id, "current benchmark revision");
  const revisions = await selectRows("benchmark_case_revisions", {
    select: "id,case_id,manifest",
    id: `eq.${caseRevisionId}`,
    case_id: `eq.${benchmarkCase.id}`,
    limit: "1",
  });
  if (!Array.isArray(revisions) || revisions.length !== 1) {
    throw new Error("current benchmark revision not found");
  }
  const revision = revisions[0];
  const revisionManifest = requireObject(revision.manifest, "benchmark revision manifest");
  const suite = normalizedSessions({ ...benchmarkCase, metadata: revisionManifest });

  const run = await insertRow("benchmark_runs", {
      case_id: benchmarkCase.id,
      execution_mode: "external-agent",
      status: "queued",
  });

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
  const attempts = await selectRows("benchmark_attempts", {
    select: "id,case_revision_id",
    id: `eq.${initialized.attemptId}`,
    limit: "1",
  });
  if (!Array.isArray(attempts) || attempts.length !== 1 || attempts[0].case_revision_id !== caseRevisionId) {
    throw new Error("Initialized attempt did not retain the selected benchmark revision.");
  }
  const sessions = [...initialized.sessions].sort(
    (left, right) => left.sequenceIndex - right.sequenceIndex,
  );
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
    await completeAndVerifySession(session, generatedConfig(initialized, session.sequenceIndex));
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

  const resultRows = await selectRows("hosted_web_results", {
    select: "session_id",
    attempt_id: `eq.${initialized.attemptId}`,
  });
  if (
    resultRows.length !== completedSessions.length ||
    new Set(resultRows.map((row) => row.session_id)).size !== resultRows.length
  ) {
    throw new Error("Hosted result rows are not unique per completed session.");
  }

  const scoreRows = await selectRows("benchmark_attempt_scores", {
    select: "id",
    attempt_id: `eq.${initialized.attemptId}`,
  });
  if (scoreRows.length !== 1) {
    throw new Error(`Expected one aggregate attempt score, got ${scoreRows.length}.`);
  }

  const selectedVariants = initialized.metadata.sessions
    .map((session) => `${session.app}:${session.metadata.questionGeneration.variantId}`)
    .join(",");
  console.log(
    `orchestrator smoke (${smokeMode}) passed: run=${run.id} attempt=${initialized.attemptId} sessions=${sessions.length} variants=${selectedVariants}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
