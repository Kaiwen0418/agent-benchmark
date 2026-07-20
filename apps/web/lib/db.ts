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
import { buildInitialRunMetadata, buildRunMetadataUpdate, parseBrowserEnvironment } from "./run-metadata";
import { completableRunStatuses, terminalRunStatuses } from "./run-lifecycle";
import { hostedWebCatalogReleases } from "@agentbench/test-cases/release";
import type { PublicConsistencyCheck } from "./public-result-consistency";
import { groupLeaderboardVersions, type LeaderboardVersionCandidate } from "./leaderboard-versions";

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

export type PublicBenchmarkCase = Pick<
  BenchmarkCase,
  "id" | "slug" | "title" | "description" | "difficulty"
> & { tag: string; version: string };

// Display-safe projection for the public suite picker. Deliberately omits
// `metadata` and `current_revision_id` so scorer-oracle surfaces never leak to
// unauthenticated clients. `difficulty` is exposed as the suite tag and the
// backend orders rows so the default suite (hard, when published) is first.
export async function listPublicHostedBenchmarkCases(): Promise<PublicBenchmarkCase[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("benchmark_cases")
    .select("id, slug, title, description, difficulty, created_at")
    .eq("is_public", true)
    .eq("provider", "hosted-web")
    .order("difficulty", { ascending: false })
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw error ?? new Error("Failed to list public benchmark cases");
  }

  const releases = hostedWebCatalogReleases();
  const releaseByCaseId = new Map(releases.map((release) => [release.benchmarkCase.id, release]));

  return data.map((item) => {
    const release = releaseByCaseId.get(item.id);
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      description: item.description,
      difficulty: item.difficulty,
      tag: item.difficulty,
      version: release?.manifest.suiteVersion ?? "",
    };
  });
}

export async function getBenchmarkCase(caseId: string): Promise<BenchmarkCase | null> {  const supabase = getSupabase();

  const byId = await supabase
    .from("benchmark_cases")
    .select(benchmarkCaseSelect)
    .eq("id", caseId)
    .maybeSingle();

  if (byId.error) {
    throw byId.error;
  }

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

  if (bySlug.error) {
    throw bySlug.error;
  }

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
  agent?: BenchmarkRun["agent"];
  browserEnvironment: NonNullable<BenchmarkRun["browserEnvironment"]>;
}): Promise<BenchmarkRun> {
  const supabase = getSupabase();
  const benchmarkCase = await getBenchmarkCase(params.caseId);
  if (!isRunnableBenchmarkCase(benchmarkCase)) {
    throw new BenchmarkCaseUnavailableError();
  }
  const initialStatus = params.executionMode === "external-agent" ? "waiting_for_agent" : "queued";
  const initialMetadata = buildInitialRunMetadata({
    agent: params.agent ?? undefined,
    browserEnvironment: params.browserEnvironment,
    now: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("benchmark_runs")
    .insert({
      case_id: benchmarkCase.id,
      user_id: params.userId,
      guest_id: params.guestId,
      execution_mode: params.executionMode,
      status: initialStatus,
      is_public: params.isPublic,
      ...initialMetadata,
    })
    .select(benchmarkRunSelect)
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create benchmark run");
  }

  await supabase.from("run_events").insert({
    run_id: data.id,
    type: "run.created",
    payload: {
      status: initialStatus,
      executionMode: params.executionMode,
      agent: params.agent ?? null,
    },
  });

  return mapRunRow(data);
}

export async function listBenchmarkRuns(): Promise<BenchmarkRun[]> {
  const supabase = getSupabase();

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
  const supabase = getSupabase();

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
  const supabase = getSupabase();

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
  const supabase = getSupabase();

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

export async function getRunStreamFingerprint(runId: string) {
  const supabase = getSupabase();

  const [runResult, eventResult, artifactResult] = await Promise.all([
    supabase
      .from("benchmark_runs")
      .select("id, status, score, error_message, started_at, completed_at, runner_id")
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("run_events")
      .select("id")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("artifacts")
      .select("id")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (runResult.error) {
    throw runResult.error;
  }
  if (eventResult.error) {
    throw eventResult.error;
  }
  if (artifactResult.error) {
    throw artifactResult.error;
  }

  return {
    run: runResult.data
      ? {
          id: runResult.data.id,
          status: runResult.data.status,
          score: runResult.data.score,
          errorMessage: runResult.data.error_message,
          completedAt: runResult.data.completed_at,
          startedAt: runResult.data.started_at,
          runnerId: runResult.data.runner_id,
        }
      : null,
    lastEventId: eventResult.data?.id ?? null,
    lastArtifactId: artifactResult.data?.id ?? null,
  };
}

export async function appendRunEvent(runId: string, input: AppendRunEventInput) {
  const supabase = getSupabase();

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
  const supabase = getSupabase();

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
  status: "completed" | "failed" | "timeout";
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
  consistencyChecks: PublicConsistencyCheck[];
};

export async function getPublicBenchmarkResult(runId: string): Promise<PublicBenchmarkResult | null> {
  const supabase = getSupabase();

  const { data: row, error } = await supabase
    .from("benchmark_runs")
    .select(benchmarkRunSelect)
    .eq("id", runId)
    .in("status", ["completed", "failed"])
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const run = mapRunRow(row);
  const [
    { data: benchmark, error: benchmarkError },
    { data: summary, error: summaryError },
    { data: results, error: resultsError },
    { data: consistencyChecks, error: consistencyError },
  ] = await Promise.all([
    supabase.from("benchmark_cases").select("title, description").eq("id", run.caseId).maybeSingle(),
    supabase.from("public_hosted_run_summaries").select("suite_slug, suite_version").eq("run_id", runId).maybeSingle(),
    supabase.from("public_hosted_run_tasks").select("app, task_slug, status, score, summary, created_at").eq("run_id", runId).order("created_at", { ascending: true }),
    supabase
      .from("public_hosted_run_consistency_checks")
      .select("sequence_index, name, source_task_slug, target_task_slug, status, score, required, failure_reason")
      .eq("run_id", runId)
      .order("sequence_index", { ascending: true }),
  ]);
  if (benchmarkError || summaryError || resultsError || consistencyError) {
    throw benchmarkError ?? summaryError ?? resultsError ?? consistencyError;
  }
  if (!benchmark) return null;

  return {
    run,
    benchmark,
    suite: summary && summary.suite_slug && summary.suite_version
      ? { slug: summary.suite_slug, version: summary.suite_version }
      : null,
    tasks: (results ?? []).map((result) => ({
      app: result.app ?? "hosted-app",
      taskSlug: result.task_slug ?? "hosted-task",
      status: result.status!,
      score: result.score!,
      summary: result.summary!,
    })),
    consistencyChecks: (consistencyChecks ?? []).map((check) => ({
      sequenceIndex: check.sequence_index ?? 0,
      name: check.name ?? "Cross-app consistency check",
      sourceTaskSlug: check.source_task_slug ?? "source task",
      targetTaskSlug: check.target_task_slug ?? "target task",
      status: check.status === "passed" ? "passed" : "failed",
      score: check.score ?? 0,
      required: check.required !== false,
      failureReason: check.failure_reason,
    })),
  };
}

export type LeaderboardVersion = {
  version: string;
  versions: string[];
  slug: string;
  tag: string;
};

export async function listPublicLeaderboardVersions(): Promise<LeaderboardVersion[]> {
  const supabase = getSupabase();

  // Start from the published catalog so every public suite appears in the
  // selector (even before it has public runs). The backend ordering puts the
  // default suite first; the frontend just picks boards[0].
  const { data: cases, error: casesError } = await supabase
    .from("benchmark_cases")
    .select("id, slug, difficulty, metadata")
    .eq("is_public", true)
    .eq("provider", "hosted-web");

  if (casesError || !cases) {
    throw casesError ?? new Error("Failed to load benchmark case tags");
  }

  const releases = hostedWebCatalogReleases();
  const releaseByCaseId = new Map(releases.map((release) => [release.benchmarkCase.id, release]));

  const seen = new Set<string>();
  const versions: LeaderboardVersionCandidate[] = [];
  const tagBySuiteSlug = new Map<string, string>();

  for (const item of cases) {
    const release = releaseByCaseId.get(item.id);
    if (!release) continue;

    const suiteSlug = release.manifest.suiteSlug;
    const suiteVersion = release.manifest.suiteVersion;
    const tag = item.difficulty;

    tagBySuiteSlug.set(suiteSlug, tag);

    const key = `${suiteSlug}:${suiteVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);

    versions.push({ version: suiteVersion, slug: suiteSlug, tag });
  }

  // Also surface any historical versions that have public runs but are no
  // longer in the current catalog release.
  const { data: publicRuns, error: runError } = await supabase
    .from("benchmark_runs")
    .select("id")
    .in("status", ["completed", "failed", "timeout"])
    .eq("is_public", true)
    .not("score", "is", null)
    .limit(1000);

  if (runError || !publicRuns) {
    throw runError ?? new Error("Failed to load leaderboard versions");
  }

  if (publicRuns.length > 0) {
    const { data: attempts, error: attemptError } = await supabase
      .from("public_hosted_run_summaries")
      .select("suite_slug, suite_version")
      .in("run_id", publicRuns.map((run) => run.id));

    if (attemptError || !attempts) {
      throw attemptError ?? new Error("Failed to load leaderboard versions");
    }

    for (const attempt of attempts) {
      if (!attempt.suite_version || !attempt.suite_slug) continue;
      const key = `${attempt.suite_slug}:${attempt.suite_version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      versions.push({
        version: attempt.suite_version,
        slug: attempt.suite_slug,
        tag: tagBySuiteSlug.get(attempt.suite_slug) ?? "",
      });
    }
  }

  return groupLeaderboardVersions(versions);
}

export async function listPublicLeaderboard(limit = 20, suiteVersions?: string[], suiteSlug?: string): Promise<LeaderboardEntry[]> {
  const supabase = getSupabase();

  let versionRunIds: string[] | null = null;
  if (suiteVersions && suiteVersions.length > 0) {
    let versionAttemptsQuery = supabase
      .from("public_hosted_run_summaries")
      .select("run_id")
      .in("suite_version", suiteVersions)
      .limit(1000);

    if (suiteSlug) {
      versionAttemptsQuery = versionAttemptsQuery.eq("suite_slug", suiteSlug);
    }

    const { data: versionAttempts, error: versionError } = await versionAttemptsQuery;

    if (versionError || !versionAttempts) {
      throw versionError ?? new Error("Failed to load leaderboard version");
    }
    versionRunIds = [...new Set(versionAttempts.map((attempt) => attempt.run_id).filter((id): id is string => Boolean(id)))];
    if (versionRunIds.length === 0) {
      return [];
    }
  }

  let runsQuery = supabase
    .from("benchmark_runs")
    .select("id, case_id, status, score, started_at, completed_at, agent_name, agent_version, base_model, browser_environment")
    .in("status", ["completed", "failed", "timeout"])
    .eq("is_public", true)
    .not("score", "is", null)
    .order("score", { ascending: false });

  if (versionRunIds) {
    runsQuery = runsQuery.in("id", versionRunIds);
  }

  const fetchLimit = Math.max(limit, Math.min(limit * 5, 100));

  const { data: runs, error } = await runsQuery.limit(fetchLimit);

  if (error || !runs) {
    throw error ?? new Error("Failed to load leaderboard");
  }

  const { data: summaries, error: summaryError } = runs.length > 0
    ? await supabase
      .from("public_hosted_run_summaries")
      .select("run_id, benchmark_title, suite_version, observed_user_agent")
      .in("run_id", runs.map((run) => run.id))
    : { data: [], error: null };
  if (summaryError) {
    throw summaryError;
  }

  const summaryByRun = new Map((summaries ?? []).map((item) => [item.run_id, item]));
  const entries = runs.map((run) => {
    const browser = run.browser_environment && typeof run.browser_environment === "object" && !Array.isArray(run.browser_environment)
      ? run.browser_environment as Record<string, unknown>
      : {};
    const summary = summaryByRun.get(run.id);
    const observedBrowser = parseBrowserEnvironment(summary?.observed_user_agent ?? null);
    const durationMs = run.started_at && run.completed_at
      ? Math.max(0, new Date(run.completed_at).getTime() - new Date(run.started_at).getTime())
      : null;
    return {
      runId: run.id,
      rank: 0,
      status: run.status as LeaderboardEntry["status"],
      score: Number(run.score),
      completedAt: run.completed_at!,
      durationMs,
      benchmark: summary?.benchmark_title ?? "Hosted benchmark",
      suiteVersion: summary?.suite_version ?? null,
      agentName: run.agent_name ?? "Unreported agent",
      agentVersion: run.agent_version ?? "unknown",
      baseModel: run.base_model ?? "Unreported model",
      browser: observedBrowser?.browser ?? (typeof browser.browser === "string" ? browser.browser : null),
      platform: observedBrowser?.platform ?? (typeof browser.platform === "string" ? browser.platform : null),
    };
  });

  entries.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const leftDuration = left.durationMs ?? Number.MAX_SAFE_INTEGER;
    const rightDuration = right.durationMs ?? Number.MAX_SAFE_INTEGER;
    return leftDuration - rightDuration;
  });

  return entries.slice(0, limit).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function getQuotaStatus(params: {
  userId: string | null;
  guestId: string | null;
}): Promise<QuotaStatus> {
  if (params.userId) {
    const supabase = getSupabase();
    let limit = DEFAULT_USER_DAILY_RUN_LIMIT;
    let used = 0;

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
  let used = 0;
  if (guestId) {
    const countResult = await getSupabase()
      .from("benchmark_runs")
      .select("*", { count: "exact", head: true })
      .eq("guest_id", guestId)
      .gte("created_at", startOfUtcDay());
    if (countResult.error) {
      throw countResult.error;
    }
    used = countResult.count ?? 0;
  }

  return {
    mode: "guest",
    isAuthenticated: false,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: null,
  };
}
