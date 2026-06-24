"use client";

import type {
  Artifact,
  BenchmarkRun,
  QuotaStatus,
  RunEvent,
  RunExecutionMode,
  RunStatus,
} from "@agentbench/protocol";
import { create } from "zustand";
import {
  deriveHostedScoring,
  type HostedSessionBreakdown,
} from "./hosted-scoring";
import { resolveAgentIdentity } from "./agent-catalog";

export type PlaygroundBenchmark = "hosted-web-suite";

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
  agentSelection: string;
  customAgent: string;
  agentVersion: string;
  modelSelection: string;
  customModel: string;
  currentRunId: string | null;
  currentExecutionMode: RunExecutionMode | null;
  liveViewUrl: string | null;
  phase: RunPhase;
  statusLine: string;
  score: number | null;
  scoringSessions: HostedSessionBreakdown[];
  activeTab: PanelTab;
  liveSlide: number;
  timeline: TimelineEntry[];
  reasoning: string[];
  artifacts: ArtifactEntry[];
  liveFrameUrl: string | null;
  bootMessages: string[];
  quota: QuotaStatus | null;
  quotaLoading: boolean;
  runError: string | null;
  streamMode: "idle" | "sse" | "polling";
  setEndpoint: (value: string) => void;
  setApiKey: (value: string) => void;
  setBenchmark: (value: PlaygroundBenchmark) => void;
  setAgentSelection: (value: string) => void;
  setCustomAgent: (value: string) => void;
  setAgentVersion: (value: string) => void;
  setModelSelection: (value: string) => void;
  setCustomModel: (value: string) => void;
  setActiveTab: (value: PanelTab) => void;
  setLiveSlide: (index: number) => void;
  fetchQuota: () => Promise<void>;
  startRun: (mode?: RunExecutionMode) => Promise<void>;
  stopRun: () => void;
  reset: () => void;
};

type RunSnapshot = {
  run: BenchmarkRun;
  events: RunEvent[];
  artifacts: Artifact[];
};

const BENCHMARK_CASE_IDS: Record<PlaygroundBenchmark, string> = {
  "hosted-web-suite": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
};

const initialState = {
  endpoint: "",
  apiKey: "",
  benchmark: "hosted-web-suite" as PlaygroundBenchmark,
  agentSelection: "",
  customAgent: "",
  agentVersion: "latest",
  modelSelection: "",
  customModel: "",
  currentRunId: null,
  currentExecutionMode: null,
  liveViewUrl: null,
  phase: "idle" as RunPhase,
  statusLine: "Run a benchmark to see your agent in action.",
  score: null,
  scoringSessions: [] as HostedSessionBreakdown[],
  activeTab: "events" as PanelTab,
  liveSlide: 0,
  timeline: [] as TimelineEntry[],
  reasoning: [] as string[],
  artifacts: [] as ArtifactEntry[],
  liveFrameUrl: null as string | null,
  bootMessages: [] as string[],
  quota: null as QuotaStatus | null,
  quotaLoading: false,
  runError: null as string | null,
  streamMode: "idle" as const,
};

let pollInterval: number | null = null;
let streamSource: EventSource | null = null;

function clearRunSync() {
  if (typeof window === "undefined") {
    return;
  }

  if (pollInterval !== null) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }

  if (streamSource) {
    streamSource.close();
    streamSource = null;
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isTerminalStatus(status: RunStatus) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "timeout";
}

function eventSummary(event: RunEvent) {
  switch (event.type) {
    case "run.created":
      return event.payload.status === "waiting_for_agent" ? "Waiting for agent connection" : "Run queued";
    case "run.assigned":
      return "Execution assigned";
    case "run.starting":
      return "Execution starting";
    case "run.running":
      return event.payload.source === "mcp" ? "Agent started using tools" : "Sandbox ready";
    case "agent.connected":
      return "Agent connected";
    case "live.frame":
      return "Live frame updated";
    case "tool.call":
      return `${String(event.payload.tool ?? "tool.call")} invoked`;
    case "tool.result":
      return `${String(event.payload.tool ?? "tool.result")} returned`;
    case "mcp.request":
      return `${String(event.payload.tool ?? "mcp.request")} requested`;
    case "mcp.response":
      return `${String(event.payload.tool ?? "mcp.response")} responded`;
    case "mcp.error":
      return `${String(event.payload.tool ?? "mcp.error")} failed`;
    case "hosted.session.created":
      return "Hosted session created";
    case "hosted.page.load":
      return `Hosted page loaded${typeof event.payload.title === "string" ? `: ${event.payload.title}` : ""}`;
    case "hosted.action":
      return `Hosted ${String(event.payload.type ?? "action")}`;
    case "hosted.task_signal":
      return `Hosted signal: ${String(event.payload.name ?? "task signal")}`;
    case "hosted.score":
      return `Hosted score updated to ${String(event.payload.score ?? "--")}`;
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

function hostedTimelineLabel(event: RunEvent) {
  if (event.type === "hosted.session.created") {
    return "hosted.session";
  }

  if (event.type === "hosted.page.load") {
    return "hosted.page.load";
  }

  if (event.type === "hosted.task_signal") {
    return `hosted.${String(event.payload.name ?? "task_signal")}`;
  }

  if (event.type === "hosted.score") {
    return "hosted.score";
  }

  return `hosted.${String(event.payload.type ?? "action")}`;
}

function hostedTimelineDetail(event: RunEvent) {
  if (event.type === "hosted.session.created") {
    return `${String(event.payload.app ?? "hosted-app")} · ${String(event.payload.taskSlug ?? "hosted-task")}`;
  }

  if (event.type === "hosted.page.load") {
    return String(event.payload.title ?? event.payload.url ?? "Hosted page loaded");
  }

  if (event.type === "hosted.task_signal") {
    return String(event.payload.name ?? "Task signal received");
  }

  if (event.type === "hosted.score") {
    return `Score ${String(event.payload.score ?? "--")}`;
  }

  return String(event.payload.type ?? "Hosted action");
}

function mapRunStatus(status: RunStatus): RunPhase {
  if (status === "queued" || status === "waiting_for_agent" || status === "agent_connected" || status === "starting") {
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
    .filter(
      (event) =>
        event.type === "tool.call" ||
        event.type === "tool.result" ||
        event.type === "agent.connected" ||
        event.type === "mcp.request" ||
        event.type === "mcp.response" ||
        event.type === "mcp.error" ||
        event.type === "hosted.session.created" ||
        event.type === "hosted.page.load" ||
        event.type === "hosted.action" ||
        event.type === "hosted.task_signal" ||
        event.type === "hosted.score" ||
        event.type === "artifact.created" ||
        event.type === "score.updated",
    )
    .map((event) => {
      const label =
        event.type === "agent.connected"
          ? "agent.connected"
          : event.type === "tool.call" ||
        event.type === "tool.result" ||
        event.type === "mcp.request" ||
        event.type === "mcp.response" ||
        event.type === "mcp.error"
          ? String(event.payload.tool ?? event.type)
          : event.type.startsWith("hosted.")
            ? hostedTimelineLabel(event)
          : event.type === "artifact.created"
            ? `artifact.${String(event.payload.type ?? "created")}`
            : "score.updated";

      const detail = event.type.startsWith("hosted.")
        ? hostedTimelineDetail(event)
        : typeof event.payload.reason === "string"
          ? event.payload.reason
          : typeof event.payload.name === "string"
            ? event.payload.name
            : JSON.stringify(event.payload);

      let status: TimelineEntry["status"] = "pending";
      if (
        event.type === "score.updated" ||
        event.type === "hosted.score" ||
        event.type === "hosted.session.created" ||
        event.type === "hosted.page.load" ||
        event.type === "hosted.task_signal" ||
        event.type === "artifact.created" ||
        event.type === "agent.connected"
      ) {
        status = "success";
      } else if (event.type === "mcp.response") {
        status =
          event.payload.status === "success"
            ? "success"
            : event.payload.status === "warning"
              ? "warning"
              : event.payload.status === "error"
                ? "error"
                : "success";
      } else if (event.type === "mcp.error") {
        status = "error";
      } else if (event.type === "tool.result") {
        status =
          event.payload.status === "success"
            ? "success"
            : event.payload.status === "warning"
              ? "warning"
              : event.payload.status === "error"
                ? "error"
                : "pending";
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

function deriveScore(run: BenchmarkRun, hostedScore: number | null, events: RunEvent[]) {
  if (typeof run.score === "number") {
    return run.score;
  }

  if (hostedScore !== null) {
    return hostedScore;
  }

  const scoreEvent = [...events].reverse().find((event) => event.type === "score.updated" || event.type === "hosted.score");
  return typeof scoreEvent?.payload.score === "number" ? scoreEvent.payload.score : null;
}

function deriveLiveFrameUrl(events: RunEvent[], artifacts: Artifact[]) {
  const liveFrameEvent = [...events]
    .reverse()
    .find((event) => event.type === "live.frame" && typeof event.payload.url === "string");

  if (liveFrameEvent && typeof liveFrameEvent.payload.url === "string") {
    return liveFrameEvent.payload.url;
  }

  const latestScreenshot = [...artifacts]
    .reverse()
    .find((artifact) => artifact.type === "screenshot" && typeof artifact.url === "string");

  return latestScreenshot?.url ?? null;
}

function applyRunSnapshot(
  snapshot: RunSnapshot,
  set: (partial: Partial<PlaygroundStore>) => void,
) {
  const { run, events, artifacts } = snapshot;
  const runPhase = mapRunStatus(run.status);
  const hasHostedActivity = events.some(
    (event) =>
      event.type === "hosted.page.load" ||
      event.type === "hosted.action" ||
      event.type === "hosted.task_signal" ||
      event.type === "hosted.score",
  );
  const phase = runPhase === "booting" && hasHostedActivity ? "running" : runPhase;
  const lastEvent = events[events.length - 1];
  const hostedScoring = deriveHostedScoring(events);
  const score = deriveScore(run, hostedScoring.score, events);
  const timeline = mapTimeline(events);
  const liveFrameUrl = deriveLiveFrameUrl(events, artifacts);

  set({
    currentRunId: run.id,
    currentExecutionMode: run.executionMode,
    liveViewUrl: run.liveViewUrl ?? `/runs/${run.id}/live`,
    phase,
    statusLine: lastEvent ? eventSummary(lastEvent) : "Run created",
    score,
    scoringSessions: hostedScoring.sessions,
    liveSlide: Math.min(Math.max(timeline.length, phase === "idle" ? 0 : 1), 4),
    timeline,
    reasoning: events.slice(-6).map(eventSummary),
    artifacts: mapArtifacts(artifacts),
    liveFrameUrl,
    bootMessages: events.slice(-5).map(eventSummary),
    activeTab: phase === "completed" ? "score" : timeline.length > 0 ? "events" : "score",
  });
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

function startFallbackPolling(
  runId: string,
  set: (partial: Partial<PlaygroundStore>) => void,
  getState: () => PlaygroundStore,
) {
  if (pollInterval !== null) {
    return;
  }

  set({ streamMode: "polling" });

  const tick = async () => {
    const state = getState();
    if (state.currentRunId !== runId) {
      clearRunSync();
      return;
    }

    const snapshot = await fetchRunSnapshot(runId);
    applyRunSnapshot(snapshot, set);

    if (isTerminalStatus(snapshot.run.status)) {
      clearRunSync();
      set({ streamMode: "idle" });
      await state.fetchQuota();
    }
  };

  void tick().catch((error) => {
    console.error("[playground] initial polling refresh failed", error);
  });

  pollInterval = window.setInterval(() => {
    void tick().catch((error) => {
      console.error("[playground] polling refresh failed", error);
    });
  }, 2000);
}

function startRunStream(
  runId: string,
  set: (partial: Partial<PlaygroundStore>) => void,
  getState: () => PlaygroundStore,
) {
  clearRunSync();
  set({ streamMode: "sse" });

  const source = new EventSource(`/api/runs/${runId}/stream`);
  streamSource = source;

  source.addEventListener("snapshot", (event) => {
    const state = getState();
    if (state.currentRunId !== runId) {
      source.close();
      return;
    }

    const snapshot = JSON.parse((event as MessageEvent<string>).data) as RunSnapshot;
    applyRunSnapshot(snapshot, set);

    if (isTerminalStatus(snapshot.run.status)) {
      clearRunSync();
      set({ streamMode: "idle" });
      void state.fetchQuota();
    }
  });

  source.addEventListener("terminal", () => {
    source.close();
  });

  source.addEventListener("error", () => {
    const state = getState();
    source.close();

    if (state.currentRunId !== runId || state.phase === "completed" || state.phase === "failed") {
      return;
    }

    startFallbackPolling(runId, set, getState);
  });
}

export const usePlaygroundStore = create<PlaygroundStore>((set, get) => ({
  ...initialState,
  setEndpoint: (value) => set({ endpoint: value }),
  setApiKey: (value) => set({ apiKey: value }),
  setBenchmark: (value) => set({ benchmark: value }),
  setAgentSelection: (value) => set({ agentSelection: value }),
  setCustomAgent: (value) => set({ customAgent: value }),
  setAgentVersion: (value) => set({ agentVersion: value }),
  setModelSelection: (value) => set({ modelSelection: value }),
  setCustomModel: (value) => set({ customModel: value }),
  setActiveTab: (value) => set({ activeTab: value }),
  setLiveSlide: (index) => set({ liveSlide: index }),
  fetchQuota: async () => {
    set({ quotaLoading: true });

    try {
      const result = await requestQuota();
      set({ quota: result.quota, quotaLoading: false, runError: null });
    } catch {
      set({ quotaLoading: false, runError: "Failed to load quota." });
    }
  },
  stopRun: () => {
    clearRunSync();
    set({ phase: "failed", statusLine: "Stopped", streamMode: "idle" });
  },
  reset: () => {
    clearRunSync();
    set((state) => ({
      ...initialState,
      quota: state.quota,
    }));
  },
  startRun: async (mode = "external-agent") => {
    if (get().phase === "booting" || get().phase === "running") {
      return;
    }

    clearRunSync();
    set({
      runError: null,
      quotaLoading: true,
    });

    try {
      const state = get();
      const benchmark = state.benchmark;
      const agent = resolveAgentIdentity(state);
      if (!agent) {
        set({
          quotaLoading: false,
          runError: "Select an agent and base model, and provide an agent version.",
        });
        return;
      }
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          caseId: BENCHMARK_CASE_IDS[benchmark],
          executionMode: mode,
          isPublic: true,
          agent,
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
          streamMode: "idle",
        });
        return;
      }

      set({
        currentRunId: result.run.id,
        currentExecutionMode: result.run.executionMode,
        liveViewUrl: result.run.liveViewUrl ?? `/runs/${result.run.id}/live`,
        phase: "booting",
        statusLine: mode === "external-agent" ? "Waiting for agent connection" : "Run queued",
        score: null,
        scoringSessions: [],
        timeline: [],
        reasoning:
          mode === "external-agent"
            ? ["Run created", "Waiting for local agent connection"]
            : ["Run queued", "Waiting for execution assignment"],
        artifacts: [],
        bootMessages:
          mode === "external-agent"
            ? ["Run created", "Waiting for local agent connection"]
            : ["Run created", "Waiting for execution assignment"],
        activeTab: "events",
        liveSlide: 1,
        quota: result.quota ?? get().quota,
        quotaLoading: false,
      });

      if (typeof window !== "undefined") {
        startRunStream(result.run.id, set, get);
      }
    } catch {
      set({
        quotaLoading: false,
        runError: "Unable to reach the run API.",
        phase: "idle",
        statusLine: "Unable to reach the run API.",
        streamMode: "idle",
      });
    }
  },
}));
