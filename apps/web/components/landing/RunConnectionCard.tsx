"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlaygroundStore } from "@/lib/playground-store";

type ConnectMethod = "link" | "browser" | "advanced";

type RunConnectPayload = {
  runId: string;
  prompt: string;
  connectUrl: string;
  configUrl: string;
  benchmark: {
    title: string;
    goal: string;
  };
  localDemo: {
    note: string;
  };
  mcp: {
    available: boolean;
    transport: string;
    url: string | null;
    headers: Record<string, string> | null;
    launchCommand: string;
    mockSitesUrl: string;
    upstreamUrl: string | null;
    status: string;
  };
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function RunConnectionCard() {
  const runId = usePlaygroundStore((state) => state.currentRunId);
  const executionMode = usePlaygroundStore((state) => state.currentExecutionMode);
  const phase = usePlaygroundStore((state) => state.phase);
  const [method, setMethod] = useState<ConnectMethod>("link");
  const [payload, setPayload] = useState<RunConnectPayload | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (phase === "booting" || phase === "running") {
      setCollapsed(false);
    } else if (phase === "completed" || phase === "failed") {
      setCollapsed(true);
    }
  }, [phase]);

  useEffect(() => {
    if (!runId) {
      setPayload(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const response = await fetch(`/api/runs/${runId}/connect`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load run connection info.");
      }

      const nextPayload = (await response.json()) as RunConnectPayload;
      if (!cancelled) {
        setPayload(nextPayload);
      }
    };

    void load().catch(() => {
      if (!cancelled) {
        setPayload(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const browserPrompt = useMemo(() => {
    if (!payload) {
      return "";
    }

    return [
      "Open the current AgentBench connection page and follow the instructions on it.",
      payload.connectUrl,
    ].join("\n");
  }, [payload]);

  if (!runId || executionMode !== "external-agent") {
    return null;
  }

  if (!payload) {
    return (
      <div className="mt-4 rounded-[1.6rem] border border-[#d7d0c4] bg-white p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
        <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Run Ready</div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-[#efede6]" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-[#efede6]" />
        </div>
      </div>
    );
  }

  const isActive = phase === "booting" || phase === "running";

  return (
    <div className="mt-4 rounded-[1.6rem] border border-[#d7d0c4] bg-white p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Run Ready</div>
          <h3 className="mt-1.5 text-[1.2rem] font-medium text-[#111111]">
            Connect your agent.
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-[#efede6] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[#4d483f]">
            {isActive ? "Run active" : "Run created"}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          >
            <path d="M2 4l4 4 4-4" stroke="#70695e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMethod("link")}
              className={`rounded-[1rem] border px-4 py-3 text-left text-sm transition ${
                method === "link"
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#d8d1c4] bg-[#faf7f1] text-[#111111]"
              }`}
            >
              <div className="font-medium">Agent Link</div>
              <div className={`mt-1 text-xs ${method === "link" ? "text-[#d9d9d9]" : "text-[#6a655c]"}`}>
                Recommended
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMethod("browser")}
              className={`rounded-[1rem] border px-4 py-3 text-left text-sm transition ${
                method === "browser"
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#d8d1c4] bg-[#faf7f1] text-[#111111]"
              }`}
            >
              <div className="font-medium">This Browser</div>
              <div className={`mt-1 text-xs ${method === "browser" ? "text-[#d9d9d9]" : "text-[#6a655c]"}`}>
                Agent controls page
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMethod("advanced")}
              className={`rounded-[1rem] border px-4 py-3 text-left text-sm transition ${
                method === "advanced"
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#d8d1c4] bg-[#faf7f1] text-[#111111]"
              }`}
            >
              <div className="font-medium">Advanced</div>
              <div className={`mt-1 text-xs ${method === "advanced" ? "text-[#d9d9d9]" : "text-[#6a655c]"}`}>
                Raw JSON + MCP
              </div>
            </button>
          </div>

          <div className="mt-5 rounded-[1.2rem] bg-[#f6f3ed] p-4">
            {method === "link" ? (
              <>
                <div className="text-sm font-medium text-[#111111]">Send to your agent</div>
                <p className="mt-2 text-sm leading-7 text-[#585248]">
                  One prompt, one URL. The agent opens the page and reads the embedded run context.
                </p>
                <pre className="mt-4 whitespace-pre-wrap rounded-[1rem] bg-white p-4 text-sm leading-7 text-[#25221d]">
                  {payload.prompt}
                </pre>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void copyText(payload.prompt).then(() => setCopyState("Prompt copied"))}
                    className="rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Copy Prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(payload.connectUrl).then(() => setCopyState("Link copied"))}
                    className="rounded-full border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111]"
                  >
                    Copy Agent Link
                  </button>
                </div>
              </>
            ) : null}

            {method === "browser" ? (
              <>
                <div className="text-sm font-medium text-[#111111]">Browser agent</div>
                <p className="mt-2 text-sm leading-7 text-[#585248]">
                  Tell the agent controlling this browser to open the connection page.
                </p>
                <pre className="mt-4 whitespace-pre-wrap rounded-[1rem] bg-white p-4 text-sm leading-7 text-[#25221d]">
                  {browserPrompt}
                </pre>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={payload.connectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Open Connection Page
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyText(browserPrompt).then(() => setCopyState("Browser prompt copied"))}
                    className="rounded-full border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111]"
                  >
                    Copy Browser Prompt
                  </button>
                </div>
              </>
            ) : null}

            {method === "advanced" ? (
              <>
                <div className="text-sm font-medium text-[#111111]">Raw config</div>
                <p className="mt-2 text-sm leading-7 text-[#585248]">
                  Full JSON payload for the run context. This local demo does not generate a remote MCP URL.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-[1rem] bg-[#111111] p-4 text-xs leading-6 text-[#d7ff00]">
                  {JSON.stringify(payload, null, 2)}
                </pre>
                <div className="mt-4 rounded-[1rem] bg-white px-4 py-3 text-sm leading-7 text-[#3f3b34]">
                  MCP transport: <span className="font-medium">{payload.mcp.transport}</span>
                  <br />
                  MCP URL: <span className="font-medium">{payload.mcp.url ?? "not generated in this build"}</span>
                  <br />
                  Auth: <span className="font-medium">{payload.mcp.headers ? "Bearer token included" : "none"}</span>
                  <br />
                  Launch command: <span className="font-medium">{payload.mcp.launchCommand}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void copyText(JSON.stringify(payload, null, 2)).then(() => setCopyState("Config copied"))}
                    className="rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Copy JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(payload.configUrl).then(() => setCopyState("Config URL copied"))}
                    className="rounded-full border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111]"
                  >
                    Copy Config URL
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {copyState ? <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#6f695f]">{copyState}</div> : null}
        </>
      )}
    </div>
  );
}
