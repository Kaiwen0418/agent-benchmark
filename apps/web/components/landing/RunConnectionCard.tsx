"use client";

import { useEffect, useState } from "react";
import { selectVisibleHostedSessions } from "@/lib/hosted-progress";
import { usePlaygroundStore } from "@/lib/playground-store";
import { RunDetailTabs } from "./RunDetailTabs";
import { ServiceUnavailableDialog } from "./ServiceUnavailableDialog";

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
  hostedNote: {
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
  const score = usePlaygroundStore((state) => state.score);
  const connectionRefreshKey = usePlaygroundStore(
    (state) =>
      state.timeline.filter(
        (entry) => entry.label === "hosted.page.load" || entry.label === "hosted.score",
      ).length,
  );
  const [payload, setPayload] = useState<RunConnectPayload | null>(null);
  const [connectError, setConnectError] = useState<RunConnectError | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (phase === "booting") {
      setCollapsed(false);
    } else if (phase === "running" || phase === "completed" || phase === "failed") {
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
  }, [connectionRefreshKey, runId, retryNonce]);

  if (!runId || executionMode !== "external-agent") {
    return null;
  }

  if (!payload) {
    return (
      <>
        {connectError ? (
          <ServiceUnavailableDialog
            message={connectError.message}
            onClose={() => setConnectError(null)}
            onRetry={() => setRetryNonce((value) => value + 1)}
          />
        ) : null}
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
      </>
    );
  }

  const isActive = phase === "booting" || phase === "running";
  const activeHostedSession = payload.hostedWeb.sessions.find(
    (session) => session.sessionId === payload.hostedWeb.activeSessionId,
  );
  const visibleHostedSessions = selectVisibleHostedSessions(
    phase,
    payload.hostedWeb.sessions,
    payload.hostedWeb.activeSessionId,
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

          <div className="mt-5 rounded-[1.2rem] bg-[#f6f3ed] p-4">
            <div className="text-sm font-medium text-[#111111]">Browser agent</div>
            <p className="mt-2 text-sm leading-7 text-[#585248]">
              Open the connection page to register the agent and continue into the benchmark, or copy a short prompt for the agent controlling this browser.
            </p>
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
                onClick={() => void copyText(payload.prompt).then(() => setCopyState("Browser prompt copied"))}
                className="rounded-full border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111]"
              >
                Copy Browser Prompt
              </button>
            </div>
          </div>

          {copyState ? <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#6f695f]">{copyState}</div> : null}
        </>
      )}

      {payload.hostedWeb.available ? (
        <div className="mt-4 rounded-[1.2rem] border border-[#dfd8cb] bg-[#fbf8f3] p-4 text-sm text-[#3f3b34]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[#70695e]">Current Suite &amp; Score</div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-[#70695e]">
                {payload.hostedWeb.progress.completed} / {payload.hostedWeb.progress.total}
              </div>
              <div className="rounded-full bg-[#d7ff00] px-2.5 py-1 text-xs font-medium text-[#111111]">
                {score === null ? "--" : `${Math.round(score * 100)}%`}
              </div>
            </div>
          </div>
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
            {visibleHostedSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex items-center justify-between gap-3 rounded-[1rem] border border-[#e1dbd0] bg-white px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#111111]">
                    {session.title ?? session.taskSlug}
                  </div>
                  <div className="mt-1 truncate text-xs text-[#6a655c]">
                    Session {session.sequenceIndex + 1} · {session.app}
                  </div>
                </div>
                <div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${statusBadgeTone(session.status)}`}>
                  {statusLabel(session.status)}
                </div>
              </div>
            ))}
          </div>
          <RunDetailTabs />
        </div>
      ) : null}
    </div>
  );
}
