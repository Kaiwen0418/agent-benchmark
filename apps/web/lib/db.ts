import type {
  AppendRunEventInput,
  Artifact,
  BenchmarkCase,
  BenchmarkRun,
  CompleteRunInput,
  QuotaStatus,
  Runner,
} from "@agentbench/protocol";
import path from "node:path";
import fs from "node:fs";
import { createSupabaseAdminClient } from "./supabase/admin";
import { mockStore } from "./mock-store";

const GUEST_RUN_LIMIT = 1;
const DEFAULT_USER_DAILY_RUN_LIMIT = 3;
const benchmarkCaseSelect = "id, slug, title, description, category, difficulty, provider, metadata, is_public, created_at";

function getSupabase() {
  return createSupabaseAdminClient();
}

export function isMockMode() {
  return !getSupabase();
}

function shouldUseLocalExternalAgentStore(params: {
  executionMode?: BenchmarkRun["executionMode"];
  benchmarkCase?: BenchmarkCase | null;
}) {
  return (
    process.env.NODE_ENV !== "production" &&
    params.executionMode === "external-agent" &&
    params.benchmarkCase?.provider !== "hosted-web"
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
    path.resolve(process.cwd(), "apps/runner/.runner-artifacts"),
    path.resolve(process.cwd(), "../runner/.runner-artifacts"),
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
    metadata: item.metadata ?? {},
    isPublic: item.is_public,
    createdAt: item.created_at,
  }));
}

export async function getBenchmarkCase(caseId: string): Promise<BenchmarkCase | null> {
  const localCase = mockStore.getCase(caseId);
  if (localCase) {
    return localCase;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return null;
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
}): BenchmarkRun {
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
  };
}

export async function createBenchmarkRun(params: {
  caseId: string;
  userId: string | null;
  guestId: string | null;
  executionMode: BenchmarkRun["executionMode"];
}): Promise<BenchmarkRun> {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.createRun(params.caseId, params.userId, params.guestId, params.executionMode);
  }

  const benchmarkCase = await getBenchmarkCase(params.caseId);
  if (shouldUseLocalExternalAgentStore({ executionMode: params.executionMode, benchmarkCase })) {
    return mockStore.createRun(params.caseId, params.userId, params.guestId, params.executionMode);
  }

  const initialStatus = params.executionMode === "external-agent" ? "waiting_for_agent" : "queued";

  const { data, error } = await supabase
    .from("benchmark_runs")
    .insert({
      case_id: params.caseId,
      user_id: params.userId,
      guest_id: params.guestId,
      execution_mode: params.executionMode,
      status: initialStatus,
    })
    .select("id, user_id, guest_id, case_id, runner_id, execution_mode, status, score, live_view_url, error_message, started_at, completed_at, created_at")
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
    .select("id, user_id, guest_id, case_id, runner_id, execution_mode, status, score, live_view_url, error_message, started_at, completed_at, created_at")
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
    .select("id, user_id, guest_id, case_id, runner_id, execution_mode, status, score, live_view_url, error_message, started_at, completed_at, created_at")
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

    const patch: Record<string, string | null> = { status: nextStatus };
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
      .select("id, user_id, guest_id, case_id, runner_id, execution_mode, status, score, live_view_url, error_message, started_at, completed_at, created_at")
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
    .select("id, user_id, guest_id, case_id, runner_id, execution_mode, status, score, live_view_url, error_message, started_at, completed_at, created_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
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

export async function registerRunner(params: {
  name: string;
  capacity: number;
}): Promise<Runner> {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.registerRunner(params.name, params.capacity);
  }

  const { data, error } = await supabase
    .from("runners")
    .insert({
      name: params.name,
      capacity: params.capacity,
      current_load: 0,
      status: "online",
      last_heartbeat: new Date().toISOString(),
    })
    .select("id, name, status, capacity, current_load, last_heartbeat, created_at")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to register runner");
  }

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    capacity: data.capacity,
    currentLoad: data.current_load,
    lastHeartbeat: data.last_heartbeat,
    createdAt: data.created_at,
  };
}

export async function heartbeatRunner(params: {
  runnerId: string;
  currentLoad: number;
  status: Runner["status"];
}) {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.heartbeatRunner(params.runnerId, params.currentLoad, params.status);
  }

  const { data, error } = await supabase
    .from("runners")
    .update({
      current_load: params.currentLoad,
      status: params.status,
      last_heartbeat: new Date().toISOString(),
    })
    .eq("id", params.runnerId)
    .select("id, name, status, capacity, current_load, last_heartbeat, created_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    capacity: data.capacity,
    currentLoad: data.current_load,
    lastHeartbeat: data.last_heartbeat,
    createdAt: data.created_at,
  };
}

export async function listRunners() {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.listRunners();
  }

  const { data, error } = await supabase
    .from("runners")
    .select("id, name, status, capacity, current_load, last_heartbeat, created_at")
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw error ?? new Error("Failed to list runners");
  }

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    capacity: item.capacity,
    currentLoad: item.current_load,
    lastHeartbeat: item.last_heartbeat,
    createdAt: item.created_at,
  }));
}

export async function assignRunnerJob(runnerId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return mockStore.assignQueuedRun(runnerId);
  }

  const { data, error } = await supabase.rpc("claim_next_benchmark_run", {
    p_runner_id: runnerId,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const runRow = Array.isArray(data) ? data[0] : data;
  if (!runRow || typeof runRow.id !== "string" || typeof runRow.case_id !== "string") {
    return null;
  }

  return mapRunRow(runRow);
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
    limit: GUEST_RUN_LIMIT,
    remaining: Math.max(0, GUEST_RUN_LIMIT - used),
    resetAt: null,
  };
}
