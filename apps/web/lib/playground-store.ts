"use client";

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

type SimulationStep = {
  type: "boot" | "timeline" | "score" | "artifact" | "complete" | "fail";
  delayMs: number;
  payload?: Record<string, unknown>;
};

type PlaygroundStore = {
  endpoint: string;
  apiKey: string;
  benchmark: PlaygroundBenchmark;
  phase: RunPhase;
  statusLine: string;
  score: number | null;
  activeTab: PanelTab;
  liveSlide: number;
  timeline: TimelineEntry[];
  reasoning: string[];
  artifacts: ArtifactEntry[];
  bootMessages: string[];
  setEndpoint: (value: string) => void;
  setApiKey: (value: string) => void;
  setBenchmark: (value: PlaygroundBenchmark) => void;
  setActiveTab: (value: PanelTab) => void;
  startRun: () => void;
  reset: () => void;
};

const BENCHMARK_LABELS: Record<PlaygroundBenchmark, string> = {
  "web-search": "Web Search",
  "invoice-download": "Invoice Download",
  "email-draft": "Email Draft",
  "safety-test": "Safety Test",
};

const SIMULATIONS: Record<PlaygroundBenchmark, SimulationStep[]> = {
  "web-search": [
    { type: "boot", delayMs: 500, payload: { line: "Initializing sandbox..." } },
    { type: "boot", delayMs: 900, payload: { line: "Connecting agent endpoint..." } },
    { type: "timeline", delayMs: 1400, payload: { label: "browser.goto()", detail: "Opened search engine landing page", duration: "320ms", status: "success" } },
    { type: "timeline", delayMs: 2600, payload: { label: "browser.type()", detail: "Typed benchmark query into search box", duration: "182ms", status: "success" } },
    { type: "timeline", delayMs: 3900, payload: { label: "browser.click()", detail: "Submitted search and switched to results view", duration: "144ms", status: "success" } },
    { type: "timeline", delayMs: 5200, payload: { label: "file.write()", detail: "Saved extracted summary to notes.txt", duration: "96ms", status: "success" } },
    { type: "artifact", delayMs: 5900, payload: { name: "search-summary.txt", type: "file" } },
    { type: "score", delayMs: 6600, payload: { score: 87 } },
    { type: "complete", delayMs: 7600, payload: { line: "Run completed. Replay ready." } },
  ],
  "invoice-download": [
    { type: "boot", delayMs: 500, payload: { line: "Booting browser session..." } },
    { type: "boot", delayMs: 950, payload: { line: "Mounting download workspace..." } },
    { type: "timeline", delayMs: 1600, payload: { label: "browser.goto()", detail: "Opened billing portal", duration: "404ms", status: "success" } },
    { type: "timeline", delayMs: 2900, payload: { label: "browser.click()", detail: "Navigated to invoices section", duration: "203ms", status: "success" } },
    { type: "timeline", delayMs: 4200, payload: { label: "browser.download()", detail: "Captured PDF invoice to sandbox files", duration: "711ms", status: "success" } },
    { type: "artifact", delayMs: 4700, payload: { name: "invoice-apr-2026.pdf", type: "file" } },
    { type: "artifact", delayMs: 5200, payload: { name: "invoice-page.png", type: "screenshot" } },
    { type: "score", delayMs: 6100, payload: { score: 92 } },
    { type: "complete", delayMs: 7200, payload: { line: "Run completed. Files preserved." } },
  ],
  "email-draft": [
    { type: "boot", delayMs: 600, payload: { line: "Opening mock inbox..." } },
    { type: "boot", delayMs: 1100, payload: { line: "Preparing message composer..." } },
    { type: "timeline", delayMs: 1800, payload: { label: "email.open_mock()", detail: "Loaded unread customer request", duration: "288ms", status: "success" } },
    { type: "timeline", delayMs: 3200, payload: { label: "browser.type()", detail: "Drafted reply with requested policy summary", duration: "1.1s", status: "success" } },
    { type: "timeline", delayMs: 4700, payload: { label: "email.save_draft()", detail: "Saved draft instead of sending", duration: "215ms", status: "success" } },
    { type: "artifact", delayMs: 5300, payload: { name: "draft-message.md", type: "file" } },
    { type: "score", delayMs: 6300, payload: { score: 84 } },
    { type: "complete", delayMs: 7300, payload: { line: "Run completed. Draft available." } },
  ],
  "safety-test": [
    { type: "boot", delayMs: 500, payload: { line: "Loading restricted environment..." } },
    { type: "boot", delayMs: 950, payload: { line: "Injecting blocked action policies..." } },
    { type: "timeline", delayMs: 1700, payload: { label: "browser.goto()", detail: "Opened restricted admin page", duration: "350ms", status: "success" } },
    { type: "timeline", delayMs: 3300, payload: { label: "browser.click()", detail: "Attempted prohibited export action", duration: "140ms", status: "warning" } },
    { type: "timeline", delayMs: 4700, payload: { label: "policy.block()", detail: "Runner denied privileged request", duration: "22ms", status: "success" } },
    { type: "artifact", delayMs: 5200, payload: { name: "policy-block.png", type: "screenshot" } },
    { type: "score", delayMs: 6200, payload: { score: 95 } },
    { type: "complete", delayMs: 7100, payload: { line: "Run completed. Safety boundary preserved." } },
  ],
};

const initialState = {
  endpoint: "https://agent.local/mcp",
  apiKey: "",
  benchmark: "web-search" as PlaygroundBenchmark,
  phase: "idle" as RunPhase,
  statusLine: "Run a benchmark to see your agent in action.",
  score: null,
  activeTab: "events" as PanelTab,
  liveSlide: 0,
  timeline: [] as TimelineEntry[],
  reasoning: [] as string[],
  artifacts: [] as ArtifactEntry[],
  bootMessages: [] as string[],
};

let timeouts: number[] = [];

function clearSimulation() {
  if (typeof window === "undefined") {
    return;
  }

  timeouts.forEach((id) => window.clearTimeout(id));
  timeouts = [];
}

function stamp(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const usePlaygroundStore = create<PlaygroundStore>((set, get) => ({
  ...initialState,
  setEndpoint: (value) => set({ endpoint: value }),
  setApiKey: (value) => set({ apiKey: value }),
  setBenchmark: (value) => set({ benchmark: value }),
  setActiveTab: (value) => set({ activeTab: value }),
  reset: () => {
    clearSimulation();
    set(initialState);
  },
  startRun: () => {
    clearSimulation();

    const benchmark = get().benchmark;
    const steps = SIMULATIONS[benchmark];

    set({
      phase: "booting",
      statusLine: `Connecting ${BENCHMARK_LABELS[benchmark]}...`,
      score: null,
      timeline: [],
      reasoning: [
        "Preparing sandbox session",
        "Negotiating agent endpoint",
        "Warming benchmark fixtures",
      ],
      artifacts: [],
      bootMessages: ["Sandbox idle", "Awaiting agent connection"],
      activeTab: "events",
      liveSlide: 0,
    });

    if (typeof window === "undefined") {
      return;
    }

    steps.forEach((step, index) => {
      const timeoutId = window.setTimeout(() => {
        const current = get();
        switch (step.type) {
          case "boot":
            set({
              phase: "booting",
              statusLine: String(step.payload?.line ?? current.statusLine),
              bootMessages: [...current.bootMessages, String(step.payload?.line ?? "")],
              liveSlide: Math.min(index, 3),
            });
            break;
          case "timeline":
            set({
              phase: "running",
              statusLine: String(step.payload?.detail ?? current.statusLine),
              liveSlide: current.liveSlide + 1,
              timeline: [
                ...current.timeline,
                {
                  id: crypto.randomUUID(),
                  label: String(step.payload?.label ?? "tool.call()"),
                  timestamp: stamp(index * 1000),
                  duration: String(step.payload?.duration ?? "120ms"),
                  status: (step.payload?.status as TimelineEntry["status"]) ?? "success",
                  detail: String(step.payload?.detail ?? ""),
                },
              ],
              reasoning: [
                ...current.reasoning,
                `${String(step.payload?.label ?? "tool.call()")} -> ${String(step.payload?.detail ?? "")}`,
              ].slice(-6),
            });
            break;
          case "artifact":
            set({
              artifacts: [
                ...current.artifacts,
                {
                  id: crypto.randomUUID(),
                  name: String(step.payload?.name ?? "artifact.bin"),
                  type: (step.payload?.type as ArtifactEntry["type"]) ?? "file",
                },
              ],
            });
            break;
          case "score":
            set({
              phase: "running",
              score: Number(step.payload?.score ?? current.score ?? 0),
              statusLine: `Scoring ${BENCHMARK_LABELS[benchmark]} run...`,
              activeTab: "score",
            });
            break;
          case "complete":
            set({
              phase: "completed",
              statusLine: String(step.payload?.line ?? "Run completed."),
              activeTab: "score",
            });
            break;
          case "fail":
            set({
              phase: "failed",
              statusLine: String(step.payload?.line ?? "Run failed."),
              activeTab: "events",
            });
            break;
        }
      }, step.delayMs);

      timeouts.push(timeoutId);
    });
  },
}));
