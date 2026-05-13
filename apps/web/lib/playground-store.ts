"use client";

import type { Artifact, BenchmarkRun, QuotaStatus, RunEvent, RunStatus } from "@agentbench/protocol";
import { create } from "zustand";

export type PlaygroundBenchmark =
  | "web-search"
  | "invoice-download"
  | "email-draft"
  | "safety-test";

export type RunPhase = "idle" | "booting" | "running" | "completed" | "failed";
export type PanelTab = "events" | "files" | "screenshots" | "score";

export type TimelineEntry = {
  id: string;
  label: string;
  timestamp: string;
  duration: string;
  status: "pending" | "success" | "warning" | "error";
  detail: string;
};

export type ArtifactEntry = {
  id: string;
  name: string;
  type: "file" | "screenshot" | "trace";
  url?: string;
};

type PlaygroundStore = {
  endpoint: string;
  apiKey: string;
  benchmark: PlaygroundBenchmark;
  currentRunId: string | null;
  phase: RunPhase;
  statusLine: string;
  score: number | null;
  activeTab: PanelTab;
  liveSlide: number;
  timeline: TimelineEntry[];
  reasoning: string[];
  artifacts: ArtifactEntry[];
  bootMessages: string[];
  quota: QuotaStatus | null;
  quotaLoading: boolean;
  runError: string | null;
  setEndpoint: (value: string) => void;
  setApiKey: (value: string) => void;
  setBenchmark: (value: PlaygroundBenchmark) => void;
  setActiveTab: (value: PanelTab) => void;
  fetchQuota: () => Promise<void>;
  startRun: () => Promise<void>;
  reset: () => void;
};

const BENCHMARK_CASE_IDS: Record<PlaygroundBenchmark, string> = {
  "web-search": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001",
  "invoice-download": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002",
  "email-draft": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0003",
  "safety-test": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0004",
};

const initialState = {
  endpoint: "https://agent.local/mcp",
  apiKey: "",
  benchmark: "web-search" as PlaygroundBenchmark,
  currentRunId: null,
  phase: "idle" as RunPhase,
  statusLine: "Run a benchmark to see your agent in action.",
  score: null,
  activeTab: "events" as PanelTab,
  liveSlide: 0,
  timeline: [] as TimelineEntry[],
  reasoning: [] as string[],
  artifacts: [] as ArtifactEntry[],
  bootMessages: [] as string[],
  quota: null as QuotaStatus | null,
  quotaLoading: false,
  runError: null as string | null,
};

let pollInterval: number | null = null;

function clearRunPolling() {
  if (typeof window === "undefined") {
    return;
  }

  if (pollInterval !== null) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function eventSummary(event: RunEvent) {
  switch (event.type) {
    case "run.created":
      return "Run queued";
    case "run.assigned":
      return "Runner assigned";
    case "run.starting":
      return "Sandbox starting";
    case "run.running":
      return "Sandbox ready";
    case "tool.call":
      return `${String(event.payload.tool ?? "tool.call")} invoked`;
    case "tool.result":
      return `${String(event.payload.tool ?? "tool.result")} returned`;
    case "artifact.created":
      return `${String(event.payload.type ?? "artifact")} captured`;
    case "score.updated":
      return `Score updated to ${String(event.payload.score ?? "--")}`;
    case "run.completed":
      return "Run completed";
    case "run.failed":
      return "Run failed";
    default:
      return event.type;
  }
}

function mapRunStatus(status: RunStatus): RunPhase {
  if (status === "queued" || status === "starting") {
    return "booting";
  }

  if (status === "running" || status === "scoring") {
    return "running";
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "failed" || status === "cancelled" || status === "timeout") {
    return "failed";
  }

  return "idle";
}

function mapTimeline(events: RunEvent[]): TimelineEntry[] {
  return events
    .filter((event) => event.type === "tool.call" || event.type === "tool.result" || event.type === "artifact.created" || event.type === "score.updated")
    .map((event) => {
      const label =
        event.type === "tool.call" || event.type === "tool.result"
          ? String(event.payload.tool ?? event.type)
          : event.type === "artifact.created"
            ? `artifact.${String(event.payload.type ?? "created")}`
            : "score.updated";

      const detail =
        typeof event.payload.reason === "string"
          ? event.payload.reason
          : typeof event.payload.name === "string"
            ? event.payload.name
            : JSON.stringify(event.payload);

      let status: TimelineEntry["status"] = "pending";
      if (event.type === "score.updated" || event.type === "artifact.created") {
        status = "success";
      } else if (event.type === "tool.result") {
        status = event.payload.status === "success" ? "success" : event.payload.status === "warning" ? "warning" : event.payload.status === "error" ? "error" : "pending";
      } else if (String(event.payload.tool ?? "").includes("policy.block")) {
        status = "warning";
      }

      return {
        id: event.id,
        label,
        timestamp: formatTime(event.createdAt),
        duration: typeof event.payload.duration === "string" ? event.payload.duration : "--",
        status,
        detail,
      };
    });
}

function mapArtifacts(artifacts: Artifact[]): ArtifactEntry[] {
  return artifacts.map((artifact) => {
    const storageName = artifact.storagePath?.split("/").pop();
    return {
      id: artifact.id,
      name: storageName ?? artifact.type,
      type: artifact.type as ArtifactEntry["type"],
      url: artifact.url ?? undefined,
    };
  });
}

function deriveScore(run: BenchmarkRun, events: RunEvent[]) {
  if (typeof run.score === "number") {
    return run.score;
  }

  const scoreEvent = [...events].reverse().find((event) => event.type === "score.updated");
  return typeof scoreEvent?.payload.score === "number" ? scoreEvent.payload.score : null;
}

async function requestQuota() {
  const response = await fetch("/api/quota", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load quota");
  }

  return (await response.json()) as { quota: QuotaStatus };
}

async function fetchRunSnapshot(runId: string) {
  const [runResponse, eventsResponse, artifactsResponse] = await Promise.all([
    fetch(`/api/runs/${runId}`, { cache: "no-store" }),
    fetch(`/api/runs/${runId}/events`, { cache: "no-store" }),
    fetch(`/api/runs/${runId}/artifacts`, { cache: "no-store" }),
  ]);

  if (!runResponse.ok || !eventsResponse.ok || !artifactsResponse.ok) {
    throw new Error("Failed to refresh run state");
  }

  const runData = (await runResponse.json()) as { run: BenchmarkRun };
  const eventsData = (await eventsResponse.json()) as { events: RunEvent[] };
  const artifactsData = (await artifactsResponse.json()) as { artifacts: Artifact[] };

  return {
    run: runData.run,
    events: eventsData.events,
    artifacts: artifactsData.artifacts,
  };
}

function applyRunSnapshot(
  run: BenchmarkRun,
  events: RunEvent[],
  artifacts: Artifact[],
  set: (partial: Partial<PlaygroundStore>) => void,
) {
  const phase = mapRunStatus(run.status);
  const lastEvent = events[events.length - 1];
  const score = deriveScore(run, events);
  const timeline = mapTimeline(events);

  set({
    currentRunId: run.id,
    phase,
    statusLine: lastEvent ? eventSummary(lastEvent) : "Run created",
    score,
    liveSlide: Math.min(Math.max(timeline.length, phase === "idle" ? 0 : 1), 4),
    timeline,
    reasoning: events.slice(-6).map(eventSummary),
    artifacts: mapArtifacts(artifacts),
    bootMessages: events.slice(-5).map(eventSummary),
    activeTab: phase === "completed" ? "score" : timeline.length > 0 ? "events" : "score",
  });
}

function startRunPolling(
  runId: string,
  set: (partial: Partial<PlaygroundStore>) => void,
  fetchQuotaFromStore: () => Promise<void>,
) {
  clearRunPolling();

  const tick = async () => {
    const snapshot = await fetchRunSnapshot(runId);
    applyRunSnapshot(snapshot.run, snapshot.events, snapshot.artifacts, set);

    if (snapshot.run.status === "completed" || snapshot.run.status === "failed" || snapshot.run.status === "cancelled" || snapshot.run.status === "timeout") {
      clearRunPolling();
      await fetchQuotaFromStore();
    }
  };

  void tick().catch((error) => {
    console.error("[playground] initial poll failed", error);
  });

  pollInterval = window.setInterval(() => {
    void tick().catch((error) => {
      console.error("[playground] poll failed", error);
    });
  }, 1500);
}

export const usePlaygroundStore = create<PlaygroundStore>((set, get) => ({
  ...initialState,
  setEndpoint: (value) => set({ endpoint: value }),
  setApiKey: (value) => set({ apiKey: value }),
  setBenchmark: (value) => set({ benchmark: value }),
  setActiveTab: (value) => set({ activeTab: value }),
  fetchQuota: async () => {
    set({ quotaLoading: true });

    try {
      const result = await requestQuota();
      set({ quota: result.quota, quotaLoading: false, runError: null });
    } catch {
      set({ quotaLoading: false, runError: "Failed to load quota." });
    }
  },
  reset: () => {
    clearRunPolling();
    set((state) => ({
      ...initialState,
      quota: state.quota,
    }));
  },
  startRun: async () => {
    if (get().phase === "booting" || get().phase === "running") {
      return;
    }

    clearRunPolling();
    set({
      runError: null,
      quotaLoading: true,
    });

    try {
      const benchmark = get().benchmark;
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          caseId: BENCHMARK_CASE_IDS[benchmark],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        set({
          quota: result.quota ?? get().quota,
          quotaLoading: false,
          runError: result.message ?? "Unable to start run.",
          phase: "idle",
          statusLine: result.message ?? "Unable to start run.",
        });
        return;
      }

      set({
        currentRunId: result.run.id,
        phase: "booting",
        statusLine: "Run queued",
        score: null,
        timeline: [],
        reasoning: ["Run queued", "Waiting for runner assignment"],
        artifacts: [],
        bootMessages: ["Run created", "Waiting for runner assignment"],
        activeTab: "events",
        liveSlide: 1,
        quota: result.quota ?? get().quota,
        quotaLoading: false,
      });

      if (typeof window !== "undefined") {
        startRunPolling(result.run.id, set, get().fetchQuota);
      }
    } catch {
      set({
        quotaLoading: false,
        runError: "Unable to reach the run API.",
        phase: "idle",
        statusLine: "Unable to reach the run API.",
      });
    }
  },
}));
