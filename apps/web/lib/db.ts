import type {
  AppendRunEventInput,
  Artifact,
  BenchmarkCase,
  BenchmarkRun,
  CompleteRunInput,
  QuotaStatus,
  SubmitRunMetadataInput,
} from "@agentbench/protocol";
import type { Database } from "@agentbench/shared";
import path from "node:path";
import fs from "node:fs";
import { createSupabaseAdminClient } from "./supabase/admin";
import { mockStore } from "./mock-store";
import { buildRunMetadataUpdate, parseBrowserEnvironment } from "./run-metadata";
import { completableRunStatuses, terminalRunStatuses } from "./run-lifecycle";

const PRODUCTION_GUEST_RUN_LIMIT = 1;
const DEVELOPMENT_GUEST_RUN_LIMIT = 10;
const DEFAULT_USER_DAILY_RUN_LIMIT = 3;
const benchmarkCaseSelect = "id, slug, title, description, category, difficulty, provider, current_revision_id, metadata, is_public, created_at";
const benchmarkRunSelect = "id, user_id, guest_id, case_id, runner_id, execution_mode, status, score, live_view_url, error_message, started_at, completed_at, created_at, metadata, agent_name, agent_version, base_model, browser_environment, is_public";

function getSupabase() {
  return createSupabaseAdminClient();
}

function getGuestRunLimit() {
  const configuredLimit = Number(process.env.GUEST_RUN_LIMIT);
  if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
    return configuredLimit;
  }

  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_GIT_COMMIT_REF === "develop"
    ? DEVELOPMENT_GUEST_RUN_LIMIT
    : PRODUCTION_GUEST_RUN_LIMIT;
}

export function isMockMode() {
  return !getSupabase();
}

export class BenchmarkCaseUnavailableError extends Error {
  code = "benchmark_case_unavailable" as const;

  constructor() {
    super("Benchmark case is not available for hosted execution.");
    this.name = "BenchmarkCaseUnavailableError";
  }
}

export function isRunnableBenchmarkCase(
  benchmarkCase: BenchmarkCase | null,
): benchmarkCase is BenchmarkCase & { currentRevisionId: string } {
  return Boolean(
    benchmarkCase?.isPublic &&
    benchmarkCase.provider === "hosted-web" &&
    benchmarkCase.currentRevisionId,
  );
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function nextUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

function getLocalArtifactsRoot() {
  const candidates = [
    path.resolve(process.cwd(), ".runner-artifacts"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function toLocalArtifactUrl(runId: string, storagePath: string | null, url: string | null) {
  if (url) {
    return url;
  }

  if (!storagePath) {
    return null;
  }

  return `/api/runs/${runId}/artifacts/file?path=${encodeURIComponent(storagePath)}`;
}

export function resolveLocalArtifactFile(runId: string, storagePath: string) {
  const normalized = storagePath.replace(/\\/g, "/");
  const expectedPrefix = `runs/${runId}/`;

  if (!normalized.startsWith(expectedPrefix)) {
    return null;
  }

  const root = getLocalArtifactsRoot();
  const relativeFile = normalized.slice(expectedPrefix.length);
  const absolute = path.resolve(root, runId, relativeFile);
  if (!absolute.startsWith(root)) {
    return null;
  }

  return absolute;
}

export async function listBenchmarkCases(): Promise<BenchmarkCase[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.listCases();
  }

  const { data, error } = await supabase
    .from("benchmark_cases")
    .select(benchmarkCaseSelect)
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw error ?? new Error("Failed to list benchmark cases");
  }

  return data.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    category: item.category,
    difficulty: item.difficulty,
    provider: item.provider ?? "native",
    currentRevisionId: item.current_revision_id,
    metadata: item.metadata ?? {},
    isPublic: item.is_public,
    createdAt: item.created_at,
  }));
}

export async function getBenchmarkCase(caseId: string): Promise<BenchmarkCase | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.getCase(caseId);
  }

  const byId = await supabase
    .from("benchmark_cases")
    .select(benchmarkCaseSelect)
    .eq("id", caseId)
    .maybeSingle();

  if (byId.data) {
    return {
      id: byId.data.id,
      slug: byId.data.slug,
      title: byId.data.title,
      description: byId.data.description,
      category: byId.data.category,
      difficulty: byId.data.difficulty,
      provider: byId.data.provider ?? "native",
      currentRevisionId: byId.data.current_revision_id,
      metadata: byId.data.metadata ?? {},
      isPublic: byId.data.is_public,
      createdAt: byId.data.created_at,
    };
  }

  const bySlug = await supabase
    .from("benchmark_cases")
    .select(benchmarkCaseSelect)
    .eq("slug", caseId)
    .maybeSingle();

  if (!bySlug.data) {
    return null;
  }

  return {
    id: bySlug.data.id,
    slug: bySlug.data.slug,
    title: bySlug.data.title,
    description: bySlug.data.description,
    category: bySlug.data.category,
    difficulty: bySlug.data.difficulty,
    provider: bySlug.data.provider ?? "native",
    currentRevisionId: bySlug.data.current_revision_id,
    metadata: bySlug.data.metadata ?? {},
    isPublic: bySlug.data.is_public,
    createdAt: bySlug.data.created_at,
  };
}

function mapRunRow(row: {
  id: string;
  user_id: string | null;
  guest_id: string | null;
  case_id: string;
  runner_id: string | null;
  execution_mode: BenchmarkRun["executionMode"];
  status: BenchmarkRun["status"];
  score: number | null;
  live_view_url: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  metadata: Database["public"]["Tables"]["benchmark_runs"]["Row"]["metadata"];
  agent_name: string | null;
  agent_version: string | null;
  base_model: string | null;
  browser_environment: Database["public"]["Tables"]["benchmark_runs"]["Row"]["browser_environment"];
  is_public: boolean;
}): BenchmarkRun {
  const browserEnvironment = row.browser_environment && typeof row.browser_environment === "object" && !Array.isArray(row.browser_environment)
    ? row.browser_environment as Record<string, unknown>
    : null;
  return {
    id: row.id,
    userId: row.user_id,
    guestId: row.guest_id,
    caseId: row.case_id,
    runnerId: row.runner_id,
    executionMode: row.execution_mode,
    status: row.status,
    score: row.score,
    liveViewUrl: row.live_view_url,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    agent: row.agent_name && row.agent_version && row.base_model
      ? { name: row.agent_name, version: row.agent_version, baseModel: row.base_model }
      : null,
    browserEnvironment: browserEnvironment
      ? {
          browser: typeof browserEnvironment.browser === "string" ? browserEnvironment.browser : null,
          browserVersion: typeof browserEnvironment.browserVersion === "string" ? browserEnvironment.browserVersion : null,
          platform: typeof browserEnvironment.platform === "string" ? browserEnvironment.platform : null,
          mobile: browserEnvironment.mobile === true,
        }
      : null,
    isPublic: row.is_public,
  };
}

export async function createBenchmarkRun(params: {
  caseId: string;
  userId: string | null;
  guestId: string | null;
  executionMode: BenchmarkRun["executionMode"];
  isPublic: boolean;
}): Promise<BenchmarkRun> {
  const supabase = getSupabase();
  const benchmarkCase = await getBenchmarkCase(params.caseId);
  if (!isRunnableBenchmarkCase(benchmarkCase)) {
    throw new BenchmarkCaseUnavailableError();
  }
  if (!supabase) {
    return mockStore.createRun(benchmarkCase.id, params.userId, params.guestId, params.executionMode);
  }

  const initialStatus = params.executionMode === "external-agent" ? "waiting_for_agent" : "queued";

  const { data, error } = await supabase
    .from("benchmark_runs")
    .insert({
      case_id: benchmarkCase.id,
      user_id: params.userId,
      guest_id: params.guestId,
      execution_mode: params.executionMode,
      status: initialStatus,
      is_public: params.isPublic,
    })
    .select(benchmarkRunSelect)
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create benchmark run");
  }

  await supabase.from("run_events").insert({
    run_id: data.id,
    type: "run.created",
    payload: { status: initialStatus, executionMode: params.executionMode },
  });

  return mapRunRow(data);
}

export async function listBenchmarkRuns(): Promise<BenchmarkRun[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.listRuns();
  }

  const { data, error } = await supabase
    .from("benchmark_runs")
    .select(benchmarkRunSelect)
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw error ?? new Error("Failed to list benchmark runs");
  }

  return data.map(mapRunRow);
}

export async function getBenchmarkRun(runId: string): Promise<BenchmarkRun | null> {
  const localRun = mockStore.getRun(runId);
  if (localRun) {
    return localRun;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("benchmark_runs")
    .select(benchmarkRunSelect)
    .eq("id", runId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRunRow(data) : null;
}

export async function listRunEvents(runId: string) {
  const localRun = mockStore.getRun(runId);
  if (localRun) {
    return mockStore.listEvents(runId);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("run_events")
    .select("id, run_id, type, payload, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw error ?? new Error("Failed to list run events");
  }

  return data.map((item) => ({
    id: item.id,
    runId: item.run_id,
    type: item.type,
    payload: item.payload,
    createdAt: item.created_at,
  }));
}

export async function listArtifacts(runId: string): Promise<Artifact[]> {
  const localRun = mockStore.getRun(runId);
  if (localRun) {
    return mockStore.listArtifacts(runId).map((artifact) => ({
      ...artifact,
      url: toLocalArtifactUrl(runId, artifact.storagePath, artifact.url),
    }));
  }

  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("artifacts")
    .select("id, run_id, type, storage_path, url, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw error ?? new Error("Failed to list artifacts");
  }

  return data.map((item) => ({
    id: item.id,
    runId: item.run_id,
    type: item.type,
    storagePath: item.storage_path,
    url: toLocalArtifactUrl(runId, item.storage_path, item.url),
    createdAt: item.created_at,
  }));
}

export async function appendRunEvent(runId: string, input: AppendRunEventInput) {
  const localRun = mockStore.getRun(runId);
  if (localRun) {
    const updatedRun =
      input.type === "agent.connected"
        ? mockStore.setRunStatus(runId, "agent_connected")
        : input.type === "run.running"
          ? (() => {
              const run = mockStore.setRunStatus(runId, "running");
              if (run && typeof input.payload.liveViewUrl === "string") {
                mockStore.setRunLiveViewUrl(runId, input.payload.liveViewUrl);
              }
              return run;
            })()
          : input.type === "run.completed"
            ? mockStore.setRunStatus(runId, "completed")
            : input.type === "run.failed"
              ? mockStore.setRunStatus(runId, "failed")
              : null;

    const event = mockStore.appendEvent(runId, input.type, input.payload);
    return { event, run: updatedRun };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { event: mockStore.appendEvent(runId, input.type, input.payload), run: null };
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("run_events")
    .insert({
      run_id: runId,
      type: input.type,
      payload: input.payload,
    })
    .select("id, run_id, type, payload, created_at")
    .single();

  if (eventError || !eventRow) {
    throw eventError ?? new Error("Failed to append run event");
  }

  let run: BenchmarkRun | null = null;
  if (
    input.type === "agent.connected" ||
    input.type === "run.running" ||
    input.type === "run.completed" ||
    input.type === "run.failed"
  ) {
    const nextStatus =
      input.type === "agent.connected"
        ? "agent_connected"
        : input.type === "run.running"
        ? "running"
        : input.type === "run.completed"
          ? "completed"
          : "failed";

    const patch: Database["public"]["Tables"]["benchmark_runs"]["Update"] = { status: nextStatus };
    if (nextStatus === "running" && typeof input.payload.liveViewUrl === "string") {
      patch.live_view_url = input.payload.liveViewUrl;
    }
    if (nextStatus === "completed" || nextStatus === "failed") {
      patch.completed_at = new Date().toISOString();
    }

    const { data: runRow, error: runError } = await supabase
      .from("benchmark_runs")
      .update(patch)
      .eq("id", runId)
      .select(benchmarkRunSelect)
      .single();

    if (runError) {
      throw runError;
    }

    run = mapRunRow(runRow);
  }

  return {
    event: {
      id: eventRow.id,
      runId: eventRow.run_id,
      type: eventRow.type,
      payload: eventRow.payload,
      createdAt: eventRow.created_at,
    },
    run,
  };
}

export async function completeBenchmarkRun(runId: string, input: CompleteRunInput) {
  const localRun = mockStore.getRun(runId);
  if (localRun) {
    if (terminalRunStatuses.has(localRun.status)) {
      return localRun;
    }
    localRun.status = input.status;
    localRun.score = input.score ?? null;
    localRun.errorMessage = input.errorMessage ?? null;
    localRun.completedAt = new Date().toISOString();

    input.artifacts.forEach((artifact) => {
      mockStore.createArtifact(runId, artifact);
    });

    mockStore.appendEvent(runId, input.status === "completed" ? "run.completed" : "run.failed", {
      score: input.score ?? null,
      errorMessage: input.errorMessage ?? null,
    });

    return localRun;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data: existingRun, error: existingRunError } = await supabase
    .from("benchmark_runs")
    .select(benchmarkRunSelect)
    .eq("id", runId)
    .maybeSingle();
  if (existingRunError) {
    throw existingRunError;
  }
  if (!existingRun) {
    return null;
  }
  if (terminalRunStatuses.has(existingRun.status)) {
    return mapRunRow(existingRun);
  }

  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("benchmark_runs")
    .update({
      status: input.status,
      score: input.score ?? null,
      error_message: input.errorMessage ?? null,
      completed_at: completedAt,
    })
    .eq("id", runId)
    .in("status", [...completableRunStatuses])
    .select(benchmarkRunSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const { data: winner, error: winnerError } = await supabase
      .from("benchmark_runs")
      .select(benchmarkRunSelect)
      .eq("id", runId)
      .maybeSingle();
    if (winnerError) {
      throw winnerError;
    }
    return winner ? mapRunRow(winner) : null;
  }

  if (input.artifacts.length > 0) {
    await supabase.from("artifacts").insert(
      input.artifacts.map((artifact) => ({
        run_id: runId,
        type: artifact.type,
        storage_path: artifact.storagePath,
        url: artifact.url,
      })),
    );
  }

  await supabase.from("run_events").insert({
    run_id: runId,
    type: input.status === "completed" ? "run.completed" : "run.failed",
    payload: {
      score: input.score ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });

  return mapRunRow(data);
}

export async function submitBenchmarkRunMetadata(
  runId: string,
  input: SubmitRunMetadataInput,
  browserEnvironment: Record<string, unknown>,
) {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const existing = await supabase.from("benchmark_runs").select("metadata, status, started_at").eq("id", runId).maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  if (!existing.data) {
    return null;
  }
  if (["completed", "failed", "cancelled", "timeout"].includes(existing.data.status)) {
    throw new Error("Run metadata is locked after the run reaches a terminal state.");
  }

  const currentMetadata = existing.data.metadata && typeof existing.data.metadata === "object" && !Array.isArray(existing.data.metadata)
    ? existing.data.metadata
    : {};
  const now = new Date().toISOString();
  const wasWaiting = existing.data.status === "waiting_for_agent";
  const { data, error } = await supabase
    .from("benchmark_runs")
    .update(buildRunMetadataUpdate({
      currentMetadata,
      currentStatus: existing.data.status,
      startedAt: existing.data.started_at,
      input,
      browserEnvironment,
      now,
    }))
    .eq("id", runId)
    .select(benchmarkRunSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (data && wasWaiting) {
    await supabase.from("run_events").insert({
      run_id: runId,
      type: "agent.connected",
      payload: { agentName: input.name, agentVersion: input.version, baseModel: input.baseModel },
    });
  }
  return data ? mapRunRow(data) : null;
}

export type LeaderboardEntry = {
  runId: string;
  rank: number;
  score: number;
  completedAt: string;
  durationMs: number | null;
  benchmark: string;
  suiteVersion: string | null;
  agentName: string;
  agentVersion: string;
  baseModel: string;
  browser: string | null;
  platform: string | null;
};

export type PublicBenchmarkResult = {
  run: BenchmarkRun;
  benchmark: { title: string; description: string };
  suite: { slug: string; version: string } | null;
  tasks: Array<{
    app: string;
    taskSlug: string;
    status: "passed" | "failed" | "error";
    score: number;
    summary: string;
  }>;
};

export async function getPublicBenchmarkResult(runId: string): Promise<PublicBenchmarkResult | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data: row, error } = await supabase
    .from("benchmark_runs")
    .select(benchmarkRunSelect)
    .eq("id", runId)
    .eq("status", "completed")
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const run = mapRunRow(row);
  const [{ data: benchmark, error: benchmarkError }, { data: attempt, error: attemptError }, { data: results, error: resultsError }] = await Promise.all([
    supabase.from("benchmark_cases").select("title, description").eq("id", run.caseId).maybeSingle(),
    supabase.from("benchmark_attempts").select("suite_slug, suite_version").eq("run_id", runId).eq("status", "completed").maybeSingle(),
    supabase.from("hosted_web_results").select("app, task_slug, status, score, summary, created_at").eq("run_id", runId).order("created_at", { ascending: true }),
  ]);
  if (benchmarkError || attemptError || resultsError) {
    throw benchmarkError ?? attemptError ?? resultsError;
  }
  if (!benchmark) return null;

  return {
    run,
    benchmark,
    suite: attempt ? { slug: attempt.suite_slug, version: attempt.suite_version } : null,
    tasks: (results ?? []).map((result) => ({
      app: result.app ?? "hosted-app",
      taskSlug: result.task_slug ?? "hosted-task",
      status: result.status,
      score: result.score,
      summary: result.summary,
    })),
  };
}

export async function listPublicLeaderboardVersions(): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data: publicRuns, error: runError } = await supabase
    .from("benchmark_runs")
    .select("id")
    .eq("status", "completed")
    .eq("is_public", true)
    .not("score", "is", null)
    .limit(1000);

  if (runError || !publicRuns) {
    throw runError ?? new Error("Failed to load leaderboard versions");
  }
  if (publicRuns.length === 0) {
    return [];
  }

  const { data: attempts, error: attemptError } = await supabase
    .from("benchmark_attempts")
    .select("suite_version")
    .eq("status", "completed")
    .in("run_id", publicRuns.map((run) => run.id))
    .order("suite_version", { ascending: false });

  if (attemptError || !attempts) {
    throw attemptError ?? new Error("Failed to load leaderboard versions");
  }

  return [...new Set(attempts.map((attempt) => attempt.suite_version))]
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" }));
}

export async function listPublicLeaderboard(limit = 20, suiteVersion?: string): Promise<LeaderboardEntry[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  let versionRunIds: string[] | null = null;
  if (suiteVersion) {
    const { data: versionAttempts, error: versionError } = await supabase
      .from("benchmark_attempts")
      .select("run_id")
      .eq("status", "completed")
      .eq("suite_version", suiteVersion)
      .limit(1000);

    if (versionError || !versionAttempts) {
      throw versionError ?? new Error("Failed to load leaderboard version");
    }
    versionRunIds = [...new Set(versionAttempts.map((attempt) => attempt.run_id))];
    if (versionRunIds.length === 0) {
      return [];
    }
  }

  let runsQuery = supabase
    .from("benchmark_runs")
    .select("id, case_id, score, started_at, completed_at, agent_name, agent_version, base_model, browser_environment")
    .eq("status", "completed")
    .eq("is_public", true)
    .not("score", "is", null)
    .order("score", { ascending: false })
    .order("completed_at", { ascending: true });

  if (versionRunIds) {
    runsQuery = runsQuery.in("id", versionRunIds);
  }

  const { data: runs, error } = await runsQuery.limit(Math.max(1, Math.min(limit, 100)));

  if (error || !runs) {
    throw error ?? new Error("Failed to load leaderboard");
  }

  const caseIds = [...new Set(runs.map((run) => run.case_id))];
  const [{ data: cases, error: caseError }, { data: attempts, error: attemptError }, { data: sessions, error: sessionError }] = await Promise.all([
    caseIds.length > 0
      ? supabase.from("benchmark_cases").select("id, title").in("id", caseIds)
      : Promise.resolve({ data: [], error: null }),
    runs.length > 0
      ? supabase.from("benchmark_attempts").select("run_id, suite_version").in("run_id", runs.map((run) => run.id))
      : Promise.resolve({ data: [], error: null }),
    runs.length > 0
      ? supabase.from("hosted_web_sessions").select("run_id, first_seen_user_agent, sequence_index").in("run_id", runs.map((run) => run.id)).order("sequence_index", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (caseError || attemptError || sessionError) {
    throw caseError ?? attemptError ?? sessionError;
  }

  const caseTitles = new Map((cases ?? []).map((item) => [item.id, item.title]));
  const suiteVersions = new Map((attempts ?? []).map((item) => [item.run_id, item.suite_version]));
  const sessionBrowsers = new Map<string, ReturnType<typeof parseBrowserEnvironment>>();
  for (const session of sessions ?? []) {
    if (!sessionBrowsers.has(session.run_id) && session.first_seen_user_agent) {
      sessionBrowsers.set(session.run_id, parseBrowserEnvironment(session.first_seen_user_agent));
    }
  }
  return runs.map((run, index) => {
    const browser = run.browser_environment && typeof run.browser_environment === "object" && !Array.isArray(run.browser_environment)
      ? run.browser_environment as Record<string, unknown>
      : {};
    const observedBrowser = sessionBrowsers.get(run.id);
    return {
      runId: run.id,
      rank: index + 1,
      score: Number(run.score),
      completedAt: run.completed_at!,
      durationMs: run.started_at && run.completed_at
        ? Math.max(0, new Date(run.completed_at).getTime() - new Date(run.started_at).getTime())
        : null,
      benchmark: caseTitles.get(run.case_id) ?? "Hosted benchmark",
      suiteVersion: suiteVersions.get(run.id) ?? null,
      agentName: run.agent_name ?? "Unreported agent",
      agentVersion: run.agent_version ?? "unknown",
      baseModel: run.base_model ?? "Unreported model",
      browser: observedBrowser?.browser ?? (typeof browser.browser === "string" ? browser.browser : null),
      platform: observedBrowser?.platform ?? (typeof browser.platform === "string" ? browser.platform : null),
    };
  });
}

export async function getQuotaStatus(params: {
  userId: string | null;
  guestId: string | null;
}): Promise<QuotaStatus> {
  if (params.userId) {
    const supabase = getSupabase();
    let limit = DEFAULT_USER_DAILY_RUN_LIMIT;
    let used = 0;

    if (!supabase) {
      used = mockStore.countRunsForUserSince(params.userId, startOfUtcDay());
    } else {
      const [profileResult, countResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("daily_run_limit")
          .eq("id", params.userId)
          .maybeSingle(),
        supabase
          .from("benchmark_runs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", params.userId)
          .gte("created_at", startOfUtcDay()),
      ]);

      if (profileResult.data?.daily_run_limit) {
        limit = profileResult.data.daily_run_limit;
      }

      if (countResult.error) {
        throw countResult.error;
      }

      used = countResult.count ?? 0;
    }

    return {
      mode: "user",
      isAuthenticated: true,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetAt: nextUtcDay(),
    };
  }

  const guestId = params.guestId;
  const limit = getGuestRunLimit();
  const used = guestId
    ? getSupabase()
      ? (
          await getSupabase()!
            .from("benchmark_runs")
            .select("*", { count: "exact", head: true })
            .eq("guest_id", guestId)
        ).count ?? 0
      : mockStore.countRunsForGuest(guestId)
    : 0;

  return {
    mode: "guest",
    isAuthenticated: false,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: null,
  };
}
