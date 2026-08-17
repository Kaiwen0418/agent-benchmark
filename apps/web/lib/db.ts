import type {
  AppendRunEventInput,
  AgentIdentity,
  Artifact,
  BenchmarkCase,
  BenchmarkRun,
  CompleteRunInput,
  QuotaStatus,
  RunEvent,
  SubmitRunMetadataInput,
} from "@agentbench/protocol";
import type { Database } from "@agentbench/shared";
import path from "node:path";
import fs from "node:fs";
import { buildInitialRunMetadata, buildRunMetadataUpdate, parseBrowserEnvironment } from "./run-metadata";
import { completableRunStatuses, terminalRunStatuses } from "./run-lifecycle";
import { hostedWebCatalogReleases } from "@agentbench/test-cases/release";
import { hostedSuiteMetadataSchema } from "@agentbench/test-cases";
import type { PublicConsistencyCheck } from "./public-result-consistency";
import { groupLeaderboardVersions, type LeaderboardVersionCandidate } from "./leaderboard-versions";
import { isCalibrationControlsEnabled, type CalibrationRunSelection } from "./calibration";
import { getModelCatalogOption } from "./model-catalog";
import {
  getPublicResultRepository,
  getWebBenchmarkCaseRepository,
  getWebControlPlaneRepository,
} from "./database";
import type {
  BenchmarkRunRecord,
  BenchmarkRunUpdate,
} from "@agentbench/database/web-control-plane";
import type { JsonValue } from "@agentbench/database";

const PRODUCTION_GUEST_RUN_LIMIT = 1;
const DEVELOPMENT_GUEST_RUN_LIMIT = 10;
const DEFAULT_USER_DAILY_RUN_LIMIT = 3;
function getGuestRunLimit() {
  const configuredLimit = Number(process.env.GUEST_RUN_LIMIT);
  if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
    return configuredLimit;
  }

  return isCalibrationControlsEnabled()
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

export class InvalidModelCatalogSelectionError extends Error {
  code = "invalid_model_selection" as const;

  constructor(message = "The selected model is no longer available in the model catalog.") {
    super(message);
    this.name = "InvalidModelCatalogSelectionError";
  }
}

async function canonicalizeAgentIdentity(
  agent: AgentIdentity,
): Promise<{ agent: AgentIdentity; catalogVerifiedAt: string | null }> {
  if (!agent.model) {
    return { agent, catalogVerifiedAt: null };
  }

  const option = await getModelCatalogOption(agent.model.provider, agent.model.id);
  if (!option) {
    throw new InvalidModelCatalogSelectionError();
  }
  if (
    agent.model.reasoningEffort &&
    option.reasoningEfforts.length > 0 &&
    !option.reasoningEfforts.includes(agent.model.reasoningEffort)
  ) {
    throw new InvalidModelCatalogSelectionError(
      "The selected reasoning effort is not supported by this catalog model.",
    );
  }

  return {
    agent: {
      ...agent,
      baseModel: option.displayName,
      model: {
        provider: option.provider,
        id: option.modelId,
        displayName: option.displayName,
        ...(agent.model.reasoningEffort
          ? { reasoningEffort: agent.model.reasoningEffort }
          : {}),
      },
    },
    catalogVerifiedAt: option.verifiedAt,
  };
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
  const rows = await getWebBenchmarkCaseRepository().listAll();
  return rows.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    category: item.category,
    difficulty: item.difficulty,
    provider: item.provider ?? "native",
    currentRevisionId: item.currentRevisionId,
    metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata
      : {},
    isPublic: item.isPublic,
    createdAt: item.createdAt,
  }));
}

export type PublicBenchmarkCase = Pick<
  BenchmarkCase,
  "id" | "slug" | "title" | "description" | "difficulty"
> & { tag: string; version: string };

export type CalibrationBenchmarkRevision = {
  caseId: string;
  revisionId: string;
  revision: string;
  version: string;
  current: boolean;
};

// Display-safe projection for the public suite picker. Deliberately omits
// `metadata` and `current_revision_id` so scorer-oracle surfaces never leak to
// unauthenticated clients. `difficulty` is exposed as the suite tag and the
// backend orders rows so the default suite (hard, when published) is first.
export async function listPublicHostedBenchmarkCases(): Promise<PublicBenchmarkCase[]> {
  const rows = await getWebBenchmarkCaseRepository().listPublicHosted();
  const releases = hostedWebCatalogReleases();
  const releaseByCaseId = new Map(releases.map((release) => [release.benchmarkCase.id, release]));

  return rows.map((item) => {
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

export async function listCalibrationBenchmarkRevisions(
  caseIds: string[],
): Promise<CalibrationBenchmarkRevision[]> {
  if (caseIds.length === 0) {
    return [];
  }

  const rows = await getWebBenchmarkCaseRepository().listCalibrationRevisions(caseIds);
  return rows.flatMap((row) => {
    const manifest = hostedSuiteMetadataSchema.safeParse(row.manifest);
    if (!manifest.success) {
      return [];
    }
    return [{
      caseId: row.caseId,
      revisionId: row.id,
      revision: row.revision,
      version: manifest.data.suiteVersion,
      current: row.currentRevisionId === row.id,
    }];
  });
}

async function isAvailableCalibrationRevision(
  caseId: string,
  caseRevisionId: string,
) {
  return getWebBenchmarkCaseRepository().revisionExists(caseId, caseRevisionId);
}

export async function getBenchmarkCase(caseId: string): Promise<BenchmarkCase | null> {
  const row = await getWebBenchmarkCaseRepository().findByIdOrSlug(caseId);
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    difficulty: row.difficulty,
    provider: row.provider ?? "native",
    currentRevisionId: row.currentRevisionId,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {},
    isPublic: row.isPublic,
    createdAt: row.createdAt,
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
  model_provider: string | null;
  model_id: string | null;
  reasoning_effort: string | null;
  model_catalog_verified_at: string | null;
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
      ? {
          name: row.agent_name,
          version: row.agent_version,
          baseModel: row.base_model,
          ...(row.model_provider && row.model_id
            ? {
                model: {
                  provider: row.model_provider,
                  id: row.model_id,
                  displayName: row.base_model,
                  ...(row.reasoning_effort
                    ? { reasoningEffort: row.reasoning_effort }
                    : {}),
                },
              }
            : {}),
        }
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

function mapDatabaseRunRow(row: BenchmarkRunRecord): BenchmarkRun {
  return mapRunRow({
    id: row.id,
    user_id: row.userId,
    guest_id: row.guestId,
    case_id: row.caseId,
    runner_id: row.runnerId,
    execution_mode: row.executionMode,
    status: row.status,
    score: row.score,
    live_view_url: row.liveViewUrl,
    error_message: row.errorMessage,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    created_at: row.createdAt,
    metadata: row.metadata as Database["public"]["Tables"]["benchmark_runs"]["Row"]["metadata"],
    agent_name: row.agentName,
    agent_version: row.agentVersion,
    base_model: row.baseModel,
    model_provider: row.modelProvider,
    model_id: row.modelId,
    reasoning_effort: row.reasoningEffort,
    model_catalog_verified_at: row.modelCatalogVerifiedAt,
    browser_environment: row.browserEnvironment as Database["public"]["Tables"]["benchmark_runs"]["Row"]["browser_environment"],
    is_public: row.isPublic,
  });
}

function toDatabaseRunUpdate(
  update: Database["public"]["Tables"]["benchmark_runs"]["Update"],
): BenchmarkRunUpdate {
  return {
    agentName: update.agent_name,
    agentVersion: update.agent_version,
    baseModel: update.base_model,
    modelProvider: update.model_provider,
    modelId: update.model_id,
    reasoningEffort: update.reasoning_effort,
    modelCatalogVerifiedAt: update.model_catalog_verified_at,
    browserEnvironment: update.browser_environment as JsonValue | undefined,
    metadata: update.metadata as JsonValue | undefined,
    startedAt: update.started_at,
    status: update.status,
  };
}

function toEventPayload(value: JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export async function createBenchmarkRun(params: {
  caseId: string;
  userId: string | null;
  guestId: string | null;
  executionMode: BenchmarkRun["executionMode"];
  isPublic: boolean;
  agent?: BenchmarkRun["agent"];
  browserEnvironment: NonNullable<BenchmarkRun["browserEnvironment"]>;
  calibration?: CalibrationRunSelection;
}): Promise<BenchmarkRun> {
  const canonicalIdentity = params.agent
    ? await canonicalizeAgentIdentity(params.agent)
    : undefined;
  const benchmarkCase = await getBenchmarkCase(params.caseId);
  if (!isRunnableBenchmarkCase(benchmarkCase)) {
    throw new BenchmarkCaseUnavailableError();
  }
  if (
    params.calibration
    && !await isAvailableCalibrationRevision(
      benchmarkCase.id,
      params.calibration.caseRevisionId,
    )
  ) {
    throw new BenchmarkCaseUnavailableError();
  }
  const initialStatus = params.executionMode === "external-agent" ? "waiting_for_agent" : "queued";
  const initialMetadata = buildInitialRunMetadata({
    agent: canonicalIdentity?.agent,
    modelCatalogVerifiedAt: canonicalIdentity?.catalogVerifiedAt ?? null,
    browserEnvironment: params.browserEnvironment,
    now: new Date().toISOString(),
    serverMetadata: params.calibration
      ? { calibration: params.calibration }
      : undefined,
  });

  const data = await getWebControlPlaneRepository().createRun({
    caseId: benchmarkCase.id,
    userId: params.userId,
    guestId: params.guestId,
    executionMode: params.executionMode,
    status: initialStatus,
    isPublic: params.isPublic,
    ...toDatabaseRunUpdate(initialMetadata),
  }, {
      status: initialStatus,
      executionMode: params.executionMode,
      agent: canonicalIdentity?.agent ?? null,
      calibration: Boolean(params.calibration),
  } as JsonValue);

  return mapDatabaseRunRow(data);
}

export async function listBenchmarkRuns(): Promise<BenchmarkRun[]> {
  const rows = await getWebControlPlaneRepository().listRuns();
  return rows.map(mapDatabaseRunRow);
}

export async function getBenchmarkRun(runId: string): Promise<BenchmarkRun | null> {
  const row = await getWebControlPlaneRepository().findRun(runId);
  return row ? mapDatabaseRunRow(row) : null;
}

export async function listRunEvents(runId: string): Promise<RunEvent[]> {
  const rows = await getWebControlPlaneRepository().listEvents(runId);
  return rows.map((item) => ({
    id: item.id,
    runId: item.runId,
    type: item.type as RunEvent["type"],
    payload: toEventPayload(item.payload),
    createdAt: item.createdAt,
  }));
}

export async function listArtifacts(runId: string): Promise<Artifact[]> {
  const rows = await getWebControlPlaneRepository().listArtifacts(runId);
  return rows.map((item) => ({
    id: item.id,
    runId: item.runId,
    type: item.type,
    storagePath: item.storagePath,
    url: toLocalArtifactUrl(runId, item.storagePath, item.url),
    createdAt: item.createdAt,
  }));
}

export async function getRunStreamFingerprint(runId: string) {
  return getWebControlPlaneRepository().streamFingerprint(runId);
}

export async function appendRunEvent(runId: string, input: AppendRunEventInput) {
  const nextStatus: BenchmarkRun["status"] | null =
    input.type === "agent.connected"
      ? "agent_connected"
      : input.type === "run.running"
        ? "running"
        : input.type === "run.completed"
          ? "completed"
          : input.type === "run.failed"
            ? "failed"
            : null;
  const transition = nextStatus
    ? {
        status: nextStatus,
        ...(nextStatus === "running" && typeof input.payload.liveViewUrl === "string"
          ? { liveViewUrl: input.payload.liveViewUrl }
          : {}),
        ...(nextStatus === "completed" || nextStatus === "failed"
          ? { completedAt: new Date().toISOString() }
          : {}),
      }
    : undefined;
  const result = await getWebControlPlaneRepository().appendEvent({
    runId,
    type: input.type,
    payload: input.payload as JsonValue,
    transition,
  });

  return {
    event: {
      id: result.event.id,
      runId: result.event.runId,
      type: result.event.type as RunEvent["type"],
      payload: toEventPayload(result.event.payload),
      createdAt: result.event.createdAt,
    },
    run: result.run ? mapDatabaseRunRow(result.run) : null,
  };
}

export async function completeBenchmarkRun(runId: string, input: CompleteRunInput) {
  const row = await getWebControlPlaneRepository().completeRun({
    runId,
    status: input.status,
    score: input.score ?? null,
    errorMessage: input.errorMessage ?? null,
    completedAt: new Date().toISOString(),
    artifacts: input.artifacts,
    completableStatuses: [...completableRunStatuses],
  });
  return row ? mapDatabaseRunRow(row) : null;
}

export async function submitBenchmarkRunMetadata(
  runId: string,
  input: SubmitRunMetadataInput,
  browserEnvironment: Record<string, unknown>,
) {
  const repository = getWebControlPlaneRepository();
  const existing = await repository.findRun(runId);
  if (!existing) {
    return null;
  }
  if (terminalRunStatuses.has(existing.status)) {
    throw new Error("Run metadata is locked after the run reaches a terminal state.");
  }

  const canonicalIdentity = await canonicalizeAgentIdentity(input);
  const canonicalInput: SubmitRunMetadataInput = {
    ...input,
    ...canonicalIdentity.agent,
  };
  const currentMetadata = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};
  const now = new Date().toISOString();
  const update = buildRunMetadataUpdate({
      currentMetadata,
      currentStatus: existing.status,
      startedAt: existing.startedAt,
      input: canonicalInput,
      modelCatalogVerifiedAt: canonicalIdentity.catalogVerifiedAt,
      browserEnvironment,
      now,
    });
  const row = await repository.updateRunMetadata({
    runId,
    update: toDatabaseRunUpdate(update),
    terminalStatuses: [...terminalRunStatuses],
    connectedEvent: existing.status === "waiting_for_agent"
      ? {
        agentName: canonicalInput.name,
        agentVersion: canonicalInput.version,
        baseModel: canonicalInput.baseModel,
        modelProvider: canonicalInput.model?.provider ?? null,
        modelId: canonicalInput.model?.id ?? null,
        reasoningEffort: canonicalInput.model?.reasoningEffort ?? null,
      }
      : null,
  });
  return row ? mapDatabaseRunRow(row) : null;
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
  reasoningEffort: string | null;
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
  const repository = getPublicResultRepository();
  const row = await repository.findRun(runId);
  if (!row) return null;

  const run = mapDatabaseRunRow(row);
  const [benchmark, summary, results, consistencyChecks] = await Promise.all([
    repository.findCase(run.caseId),
    repository.findSummary(runId),
    repository.listTasks(runId),
    repository.listConsistencyChecks(runId),
  ]);
  if (!benchmark) return null;

  return {
    run,
    benchmark,
    suite: summary?.suiteSlug && summary.suiteVersion
      ? { slug: summary.suiteSlug, version: summary.suiteVersion }
      : null,
    tasks: results.map((result) => ({
      app: result.app ?? "hosted-app",
      taskSlug: result.taskSlug ?? "hosted-task",
      status: result.status!,
      score: result.score!,
      summary: result.summary!,
    })),
    consistencyChecks: consistencyChecks.map((check) => ({
      sequenceIndex: check.sequenceIndex ?? 0,
      name: check.name ?? "Cross-app consistency check",
      sourceTaskSlug: check.sourceTaskSlug ?? "source task",
      targetTaskSlug: check.targetTaskSlug ?? "target task",
      status: check.status === "passed" ? "passed" : "failed",
      score: check.score ?? 0,
      required: check.required !== false,
      failureReason: check.failureReason,
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
  const repository = getPublicResultRepository();

  // Start from the published catalog so every public suite appears in the
  // selector (even before it has public runs). The backend ordering puts the
  // default suite first; the frontend just picks boards[0].
  const cases = await repository.listPublishedCases();

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
  const publicRuns = await repository.listTerminalRunIds(1000);

  if (publicRuns.length > 0) {
    const attempts = await repository.listSummaries(publicRuns.map((run) => run.id));

    for (const attempt of attempts) {
      if (!attempt.suiteVersion || !attempt.suiteSlug) continue;
      const key = `${attempt.suiteSlug}:${attempt.suiteVersion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      versions.push({
        version: attempt.suiteVersion,
        slug: attempt.suiteSlug,
        tag: tagBySuiteSlug.get(attempt.suiteSlug) ?? "",
      });
    }
  }

  return groupLeaderboardVersions(versions);
}

export async function listPublicLeaderboard(limit = 20, suiteVersions?: string[], suiteSlug?: string): Promise<LeaderboardEntry[]> {
  const repository = getPublicResultRepository();

  let versionRunIds: string[] | null = null;
  if (suiteVersions && suiteVersions.length > 0) {
    versionRunIds = await repository.listRunIdsBySuite(suiteVersions, suiteSlug);
    if (versionRunIds.length === 0) {
      return [];
    }
  }

  const fetchLimit = Math.max(limit, Math.min(limit * 5, 100));
  const runs = await repository.listLeaderboardRuns(versionRunIds, fetchLimit);
  const summaries = await repository.listSummaries(runs.map((run) => run.id));
  const summaryByRun = new Map(summaries.map((item) => [item.runId, item]));
  const entries = runs.map((run) => {
    const browser = run.browserEnvironment && typeof run.browserEnvironment === "object" && !Array.isArray(run.browserEnvironment)
      ? run.browserEnvironment as Record<string, unknown>
      : {};
    const summary = summaryByRun.get(run.id);
    const observedBrowser = parseBrowserEnvironment(summary?.observedUserAgent ?? null);
    const durationMs = run.startedAt && run.completedAt
      ? Math.max(0, new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())
      : null;
    return {
      runId: run.id,
      rank: 0,
      status: run.status as LeaderboardEntry["status"],
      score: Number(run.score),
      completedAt: run.completedAt!,
      durationMs,
      benchmark: summary?.benchmarkTitle ?? "Hosted benchmark",
      suiteVersion: summary?.suiteVersion ?? null,
      agentName: run.agentName ?? "Unreported agent",
      agentVersion: run.agentVersion ?? "unknown",
      baseModel: run.baseModel ?? "Unreported model",
      reasoningEffort: run.reasoningEffort,
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
  const repository = getWebControlPlaneRepository();
  if (params.userId) {
    const [configuredLimit, used] = await Promise.all([
      repository.findUserDailyLimit(params.userId),
      repository.countRunsSince({ userId: params.userId }, startOfUtcDay()),
    ]);
    const limit = configuredLimit ?? DEFAULT_USER_DAILY_RUN_LIMIT;

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
    ? await repository.countRunsSince({ guestId }, startOfUtcDay())
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
