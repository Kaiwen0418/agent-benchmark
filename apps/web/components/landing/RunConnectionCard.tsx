"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlaygroundStore } from "@/lib/playground-store";

type ConnectMethod = "link" | "browser" | "advanced";

type RunConnectPayload = {
  runId: string;
  status: string;
  errorMessage: string | null;
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
  hostedWeb: {
    available: boolean;
    attemptId: string | null;
    suiteSlug: string | null;
    suiteVersion: string | null;
    orchestratorUrl: string | null;
    advanceUrl: string | null;
    activeSessionId: string | null;
    progress: {
      currentIndex: number | null;
      total: number;
      completed: number;
    };
    sessions: Array<{
      sessionId: string;
      app: string;
      taskSlug: string;
      taskVersion: string;
      sequenceIndex: number;
      weight: number;
      required: boolean;
      startUrl: string;
      goal: string;
      title: string | null;
      status: string;
    }>;
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

function statusBadgeTone(status: string) {
  if (status === "completed") {
    return "bg-[#e8f7ec] text-[#1f6b35]";
  }

  if (status === "failed" || status === "timeout" || status === "expired") {
    return "bg-[#fff1ed] text-[#8a2d1f]";
  }

  if (status === "active" || status === "running") {
    return "bg-[#eef6ff] text-[#245a8a]";
  }

  return "bg-[#efede6] text-[#4d483f]";
}

function statusLabel(status: string) {
  return status.replaceAll("-", " ");
}

type RunConnectError = {
  error: string;
  message: string;
  retryable?: boolean;
  hostedSitesUrl?: string;
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
  const [connectError, setConnectError] = useState<RunConnectError | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

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
      setConnectError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setConnectError(null);
      const response = await fetch(`/api/runs/${runId}/connect`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as RunConnectError | null;
        throw errorPayload ?? {
          error: "run_connect_failed",
          message: "Failed to load run connection info.",
          retryable: true,
        };
      }

      const nextPayload = (await response.json()) as RunConnectPayload;
      if (!cancelled) {
        setPayload(nextPayload);
        setConnectError(null);
      }
    };

    void load().catch((error: RunConnectError | Error) => {
      if (!cancelled) {
        setPayload(null);
        setConnectError({
          error: "error" in error ? error.error : "run_connect_failed",
          message: error.message || "Failed to load run connection info.",
          retryable: "retryable" in error ? error.retryable : true,
          hostedSitesUrl: "hostedSitesUrl" in error ? error.hostedSitesUrl : undefined,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [runId, retryNonce]);

  const browserPrompt = useMemo(() => {
    if (!payload) {
      return "";
    }

    if (payload.hostedWeb.available && payload.hostedWeb.orchestratorUrl) {
      return [
        "Open the hosted AgentBench benchmark suite and complete the current objective.",
        payload.hostedWeb.orchestratorUrl,
      ].join("\n");
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
      <div className={`mt-4 rounded-[1.6rem] border p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)] ${
        connectError ? "border-[#d7a39a] bg-[#fff7f5]" : "border-[#d7d0c4] bg-white"
      }`}>
        <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Run Ready</div>
        {connectError ? (
          <div className="mt-3">
            <h3 className="text-[1.05rem] font-medium text-[#7d241b]">Hosted site connection failed.</h3>
            <p className="mt-2 text-sm leading-7 text-[#5b3d37]">{connectError.message}</p>
            {connectError.hostedSitesUrl ? (
              <p className="mt-2 text-xs text-[#80534b]">
                Hosted URL: <span className="font-medium">{connectError.hostedSitesUrl}</span>
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-6 text-[#80534b]">
              Check that `HOSTED_SITES_URL` is configured in Vercel and that the hosted-sites `/health` endpoint is reachable.
            </p>
            <button
              type="button"
              onClick={() => setRetryNonce((value) => value + 1)}
              className="mt-4 rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
            >
              Retry connection
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-[#efede6]" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-[#efede6]" />
          </div>
        )}
      </div>
    );
  }

  const isActive = phase === "booting" || phase === "running";
  const activeHostedSession = payload.hostedWeb.sessions.find(
    (session) => session.sessionId === payload.hostedWeb.activeSessionId,
  );
  const isTerminalRun =
    payload.status === "completed" ||
    payload.status === "failed" ||
    payload.status === "cancelled" ||
    payload.status === "timeout";
  const terminalSummary =
    payload.status === "timeout"
      ? payload.errorMessage ?? "This hosted suite timed out before the active session was completed."
      : payload.status === "failed"
        ? payload.errorMessage ?? "This run ended in a failed state."
        : payload.status === "completed"
          ? "This run has already completed."
          : null;

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
          <div className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${statusBadgeTone(payload.status)}`}>
            {isTerminalRun ? statusLabel(payload.status) : isActive ? "Run active" : "Run created"}
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
          {terminalSummary ? (
            <div className="mt-5 rounded-[1.2rem] border border-[#e6b3a9] bg-[#fff7f4] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-[#8a2d1f]">
                {payload.status === "timeout" ? "Run timed out" : "Run ended"}
              </div>
              <p className="mt-2 text-sm leading-7 text-[#5b3d37]">{terminalSummary}</p>
            </div>
          ) : null}

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
                Raw hosted config
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
                {!payload.hostedWeb.orchestratorUrl && payload.hostedWeb.available ? (
                  <p className="mt-3 text-xs leading-6 text-[#80534b]">
                    This hosted suite no longer has an active session URL. Review the run status and summary above.
                  </p>
                ) : null}
              </>
            ) : null}

            {method === "browser" ? (
              <>
                <div className="text-sm font-medium text-[#111111]">Browser agent</div>
                <p className="mt-2 text-sm leading-7 text-[#585248]">
                  Tell the agent controlling this browser to open the active hosted session for this suite.
                </p>
                <pre className="mt-4 whitespace-pre-wrap rounded-[1rem] bg-white p-4 text-sm leading-7 text-[#25221d]">
                  {browserPrompt}
                </pre>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={payload.hostedWeb.orchestratorUrl ?? payload.connectUrl}
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
                {!payload.hostedWeb.orchestratorUrl && payload.hostedWeb.available ? (
                  <p className="mt-3 text-xs leading-6 text-[#80534b]">
                    There is no active hosted session to open for this run.
                  </p>
                ) : null}
              </>
            ) : null}

            {method === "advanced" ? (
              <>
                <div className="text-sm font-medium text-[#111111]">Raw config</div>
                <p className="mt-2 text-sm leading-7 text-[#585248]">
                  Full JSON payload for the run context. Hosted-web runs use the hosted URL as the primary agent target; MCP is legacy optional context.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-[1rem] bg-[#111111] p-4 text-xs leading-6 text-[#d7ff00]">
                  {JSON.stringify(payload, null, 2)}
                </pre>
                <div className="mt-4 rounded-[1rem] bg-white px-4 py-3 text-sm leading-7 text-[#3f3b34]">
                  Suite: <span className="font-medium">{payload.hostedWeb.suiteSlug ?? "not available"}</span>
                  <br />
                  Attempt id: <span className="font-medium">{payload.hostedWeb.attemptId ?? "not allocated"}</span>
                  <br />
                  Active session: <span className="font-medium">{payload.hostedWeb.activeSessionId ?? "not allocated"}</span>
                  <br />
                  Hosted-web URL: <span className="font-medium">{payload.hostedWeb.orchestratorUrl ?? "not available"}</span>
                  <br />
                  Legacy MCP: <span className="font-medium">{payload.mcp.available ? "available" : "not required"}</span>
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
          {payload.hostedWeb.available ? (
            <div className="mt-4 rounded-[1.2rem] border border-[#dfd8cb] bg-[#fbf8f3] p-4 text-sm text-[#3f3b34]">
              <div className="text-xs uppercase tracking-[0.18em] text-[#70695e]">Hosted Suite</div>
              <div className="mt-2 font-medium text-[#111111]">
                {activeHostedSession && payload.hostedWeb.progress.currentIndex !== null
                  ? `Session ${payload.hostedWeb.progress.currentIndex + 1} / ${payload.hostedWeb.progress.total}`
                  : isTerminalRun
                    ? "No active hosted session"
                    : "Hosted sessions allocated"}
              </div>
              <p className="mt-2 leading-7">
                {activeHostedSession
                  ? `${activeHostedSession.title ?? activeHostedSession.taskSlug} · ${activeHostedSession.goal}`
                  : terminalSummary ?? "This run does not currently expose an active hosted objective."}
              </p>
              <div className="mt-4 grid gap-2">
                {payload.hostedWeb.sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="flex items-start justify-between gap-3 rounded-[1rem] border border-[#e1dbd0] bg-white px-3 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-[#111111]">
                        {session.title ?? session.taskSlug}
                      </div>
                      <div className="mt-1 text-xs text-[#6a655c]">
                        Session {session.sequenceIndex + 1} · {session.app}
                      </div>
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${statusBadgeTone(session.status)}`}>
                      {statusLabel(session.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
