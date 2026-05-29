import type { BenchmarkCase, BenchmarkRun } from "@agentbench/protocol";
import { createSupabaseAdminClient } from "./supabase/admin";

type HostedWebSession = {
  sessionId: string;
  attemptId: string | null;
  token: string;
  taskSlug: string;
  startUrl: string;
  goal: string;
};

type HostedWebAttempt = {
  id: string;
  suiteSlug: string;
  suiteVersion: string;
};

type HostedWebStore = {
  sessionsByRunId: Map<string, HostedWebSession>;
  attemptsByRunId: Map<string, HostedWebAttempt | null>;
};

declare global {
  var __agentbenchHostedWebStore: HostedWebStore | undefined;
}

function getStore() {
  if (!global.__agentbenchHostedWebStore) {
    global.__agentbenchHostedWebStore = {
      sessionsByRunId: new Map(),
      attemptsByRunId: new Map(),
    };
  }

  return global.__agentbenchHostedWebStore;
}

function getHostedSitesBaseUrl() {
  return process.env.HOSTED_SITES_URL ?? "http://localhost:3003";
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  return typeof metadata[key] === "string" ? metadata[key] : fallback;
}

export function isHostedWebCase(benchmarkCase: BenchmarkCase | null) {
  return benchmarkCase?.provider === "hosted-web";
}

async function getOrCreateHostedWebAttempt(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  const store = getStore();
  if (store.attemptsByRunId.has(params.run.id)) {
    return store.attemptsByRunId.get(params.run.id) ?? null;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    store.attemptsByRunId.set(params.run.id, null);
    return null;
  }

  const metadata = params.benchmarkCase.metadata;
  const suiteSlug = metadataString(metadata, "suiteSlug", params.benchmarkCase.slug);
  const suiteVersion = metadataString(metadata, "suiteVersion", "v1");
  const app = metadataString(metadata, "app", "shopping-lite");
  const taskSlug = metadataString(metadata, "taskSlug", params.benchmarkCase.slug);

  const { data, error } = await supabase
    .from("benchmark_attempts")
    .insert({
      run_id: params.run.id,
      case_id: params.benchmarkCase.id,
      provider: "hosted-web",
      suite_slug: suiteSlug,
      suite_version: suiteVersion,
      status: "running",
      metadata: {
        app,
        taskSlug,
        seedVersion: metadataString(metadata, "seedVersion", "shopping-lite-v1"),
      },
      started_at: new Date().toISOString(),
    })
    .select("id, suite_slug, suite_version")
    .single();

  if (error || !data) {
    console.error("[web] failed to create hosted-web attempt", error);
    store.attemptsByRunId.set(params.run.id, null);
    return null;
  }

  const attempt: HostedWebAttempt = {
    id: data.id,
    suiteSlug: data.suite_slug,
    suiteVersion: data.suite_version,
  };
  store.attemptsByRunId.set(params.run.id, attempt);
  return attempt;
}

export async function getOrCreateHostedWebSession(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase;
}) {
  const store = getStore();
  const existing = store.sessionsByRunId.get(params.run.id);
  if (existing) {
    return existing;
  }

  const metadata = params.benchmarkCase.metadata;
  const attempt = await getOrCreateHostedWebAttempt(params);
  const baseUrl = getHostedSitesBaseUrl();
  const response = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runId: params.run.id,
      caseId: params.benchmarkCase.id,
      attemptId: attempt?.id ?? null,
      callbackSecret: process.env.RUNNER_SHARED_SECRET ?? null,
      taskSlug:
        typeof metadata.taskSlug === "string"
          ? metadata.taskSlug
          : params.benchmarkCase.slug,
      taskVersion: metadataString(metadata, "taskVersion", "v1"),
      suiteSlug: attempt?.suiteSlug ?? metadataString(metadata, "suiteSlug", params.benchmarkCase.slug),
      suiteVersion: attempt?.suiteVersion ?? metadataString(metadata, "suiteVersion", "v1"),
      weight: 1,
      required: true,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to create hosted-web session at ${baseUrl}: ${response.status}`);
  }

  const session = (await response.json()) as HostedWebSession;
  store.sessionsByRunId.set(params.run.id, session);
  return session;
}
