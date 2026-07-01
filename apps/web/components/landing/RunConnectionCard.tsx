"use client";

import { useEffect, useState } from "react";
import type { HostedSessionBreakdown } from "@/lib/hosted-scoring";
import { usePlaygroundStore } from "@/lib/playground-store";
import { ServiceUnavailableDialog } from "./ServiceUnavailableDialog";
import type { HostedSessionDeadline } from "@/lib/db";

type RunConnectPayload = {
  runId: string;
  status: string;
  errorMessage: string | null;
  metadataRequired: boolean;
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
    timeLimitMinutes: number | null;
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

type RunConnectError = {
  error: string;
  message: string;
  retryable?: boolean;
  hostedSitesUrl?: string;
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function useActiveSessionDeadline(runId: string | null) {
  const [deadline, setDeadline] = useState<HostedSessionDeadline | null>(null);

  useEffect(() => {
    if (!runId) {
      setDeadline(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/runs/${runId}/hosted-sessions`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = (await response.json()) as { sessions: HostedSessionDeadline[] };
        if (cancelled) return;
        const active = result.sessions.find((session) => session.status === "active") ?? null;
        setDeadline(active);
      } catch (error) {
        console.error("[run-connection-card] failed to refresh deadlines", error);
      }
    }

    void load();
    const interval = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId]);

  return deadline;
}

function statusBadgeTone(status: string) {
  if (status === "completed") {
    return "bg-[#e8f7ec] text-[#1f6b35]";
  }
  if (status === "failed" || status === "timeout" || status === "expired") {
    return "bg-[#fff1ed] text-[#8a2d1f]";
  }
  if (status === "active" || status === "running") {
    return "bg-[#d7ff00] text-[#111111]";
  }
  return "bg-[#efede6] text-[#4d483f]";
}

function statusLabel(status: string) {
  return status.replaceAll("-", " ");
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <path d="M4 10.5l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ChartIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 9l-4.5 4.5L9 9l-4 4" />
    </svg>
  );
}

function BoltIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
    </svg>
  );
}

function CircleCheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  );
}

function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[#111111]">
        <span className="text-[#6a655c]">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function SessionStepper({
  sessions,
  currentIndex,
  completed,
}: {
  sessions: RunConnectPayload["hostedWeb"]["sessions"];
  currentIndex: number | null;
  completed: number;
}) {
  const sorted = [...sessions].sort((left, right) => left.sequenceIndex - right.sequenceIndex);

  return (
    <div className="flex flex-wrap items-start gap-2">
      {sorted.map((session, index) => {
        const isCompleted = index < completed;
        const isCurrent = index === currentIndex;
        return (
          <div
            key={session.sessionId}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
            title={`Session ${index + 1}`}
          >
            <div
              className={`flex h-full w-full items-center justify-center rounded-full ${
                isCompleted
                  ? "bg-[#4da66a] text-white"
                  : isCurrent
                    ? "bg-[#d7ff00] text-[#111111] ring-2 ring-[#d7ff00]/30"
                    : "border border-[#d8d1c4] bg-white text-[#6a655c]"
              }`}
            >
              {isCompleted ? <CheckIcon /> : index + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreCheck({ session }: { session: HostedSessionBreakdown }) {
  return (
    <div className="group rounded-[0.9rem] border border-[#e2ddd3] bg-white px-3 py-3 transition hover:border-[#111111]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[#111111]">{session.taskSlug}</div>
          <div className="mt-0.5 text-xs text-[#6a655c]">{session.summary}</div>
        </div>
        <div
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            session.status === "passed" ? "bg-[#e8f7ec] text-[#1f6b35]" : "bg-[#fff1ed] text-[#8a2d1f]"
          }`}
        >
          {Math.round(session.score * 100)}%
        </div>
      </div>
      {session.evaluators.length > 0 ? (
        <div className="mt-3 hidden space-y-1.5 group-hover:block">
          {session.evaluators.map((evaluator) => (
            <div key={`${evaluator.type}:${evaluator.name}`} className="flex items-start gap-2 text-xs leading-5">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  evaluator.status === "passed" ? "bg-[#4da66a]" : "bg-[#d45b45]"
                }`}
              />
              <div className="min-w-0">
                <div className="text-[#292620]">
                  {evaluator.name}
                  {evaluator.required ? null : " (optional)"}
                </div>
                {evaluator.errorMessage ? <div className="text-[#8a4334]">{evaluator.errorMessage}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EventRow({ label, timestamp, detail }: { label: string; timestamp: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-xs text-[#292620]">{detail}</div>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-[#8f897e]">{timestamp}</span>
    </div>
  );
}

export function RunConnectionCard() {
  const runId = usePlaygroundStore((state) => state.currentRunId);
  const executionMode = usePlaygroundStore((state) => state.currentExecutionMode);
  const phase = usePlaygroundStore((state) => state.phase);
  const score = usePlaygroundStore((state) => state.score);
  const scoringSessions = usePlaygroundStore((state) => state.scoringSessions);
  const timeline = usePlaygroundStore((state) => state.timeline);
  const streamMode = usePlaygroundStore((state) => state.streamMode);
  const activeDeadline = useActiveSessionDeadline(runId);
  const now = useNow();
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
  const [showAllEvents, setShowAllEvents] = useState(false);
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
        <div
          className={`mt-4 rounded-[1.6rem] border p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)] ${
            connectError ? "border-[#d7a39a] bg-[#fff7f5]" : "border-[#d7d0c4] bg-white"
          }`}
        >
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
  const isTerminalRun =
    payload.status === "completed" ||
    payload.status === "failed" ||
    payload.status === "cancelled" ||
    payload.status === "timeout";
  const activeHostedSession = payload.hostedWeb.sessions.find(
    (session) => session.sessionId === payload.hostedWeb.activeSessionId,
  );

  const terminalSummary =
    payload.status === "timeout"
      ? payload.errorMessage ?? "This hosted suite timed out before the active session was completed."
      : payload.status === "failed"
        ? payload.errorMessage ?? "This run ended in a failed state."
        : payload.status === "completed"
          ? "This run has already completed."
          : null;

  const sortedSessions = [...payload.hostedWeb.sessions].sort(
    (left, right) => left.sequenceIndex - right.sequenceIndex,
  );

  const countdownText = (() => {
    if (!activeDeadline?.expiresAt) return null;
    const remaining = new Date(activeDeadline.expiresAt).getTime() - now;
    if (remaining <= 0) return "Timed out";
    return `Time left: ${formatCountdown(remaining)}`;
  })();
  const countdownUrgent = Boolean(
    activeDeadline?.expiresAt && new Date(activeDeadline.expiresAt).getTime() - now < 60_000,
  );

  const displayedEvents = showAllEvents
    ? [...timeline].reverse()
    : [...timeline].slice(-5).reverse();

  return (
    <div className="mt-4 rounded-[1.6rem] border border-[#d7d0c4] bg-white p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Run Status</span>
          <div
            className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${statusBadgeTone(payload.status)}`}
          >
            {isTerminalRun ? statusLabel(payload.status) : isActive ? "Running" : "Run created"}
          </div>
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
      </button>

      {!collapsed && (
        <div className="mt-5 space-y-5">
          {phase === "booting" ? (
            <section>
              <SectionTitle icon={<DocumentIcon />} title="Agent Connection" />
              <p className="text-sm leading-7 text-[#585248]">
                Open the connection page to register the agent, or copy a short prompt for the agent controlling this browser.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={payload.connectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111]"
                >
                  Open Connection Page
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(payload.prompt).then(() => setCopyState("Browser prompt copied"));
                  }}
                  className="rounded-full border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111] transition hover:border-[#111111]"
                >
                  Copy Browser Prompt
                </button>
              </div>
              {copyState ? <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#6f695f]">{copyState}</div> : null}
            </section>
          ) : null}

          {terminalSummary ? (
            <section className="rounded-[1.2rem] border border-[#e6b3a9] bg-[#fff7f4] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-[#8a2d1f]">
                {payload.status === "timeout" ? "Run timed out" : "Run ended"}
              </div>
              <p className="mt-2 text-sm leading-7 text-[#5b3d37]">{terminalSummary}</p>
            </section>
          ) : null}

          {payload.hostedWeb.available ? (
            <>
              <hr className="border-[#e8e4da]" />

              <section>
                <SectionTitle icon={<DocumentIcon />} title="Current Task" />
                {activeHostedSession ? (
                  <div className="rounded-[1rem] border border-[#e8e4da] bg-[#fbf8f3] px-4 py-3">
                    <div className="text-sm font-semibold text-[#111111]">
                      {activeHostedSession.title ?? activeHostedSession.taskSlug}
                    </div>
                    <p className="max-h-28 overflow-y-auto pr-1 text-sm leading-7 text-[#585248] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d8d1c4]">
                      {activeHostedSession.goal}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#8f897e]">
                      <span>{activeHostedSession.app}</span>
                      <span>·</span>
                      <span>Session {activeHostedSession.sequenceIndex + 1}</span>
                    </div>
                    {countdownText ? (
                      <div
                        className={`mt-2 text-[10px] font-semibold uppercase tracking-wider ${
                          countdownUrgent ? "text-[#d45b45]" : "text-[#6a655c]"
                        }`}
                      >
                        {countdownText}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-[#d8d1c4] bg-white/60 px-4 py-3 text-sm text-[#7a7469]">
                    No active hosted task.
                  </div>
                )}
              </section>

              <hr className="border-[#e8e4da]" />

              <section>
                <SectionTitle
                  icon={<ChartIcon />}
                  title="Progress"
                  action={
                    <span className="text-xs text-[#6a655c]">
                      {payload.hostedWeb.progress.completed} / {payload.hostedWeb.progress.total} sessions
                    </span>
                  }
                />
                <SessionStepper
                  sessions={sortedSessions}
                  currentIndex={payload.hostedWeb.progress.currentIndex}
                  completed={payload.hostedWeb.progress.completed}
                />
              </section>

              <hr className="border-[#e8e4da]" />

              {scoringSessions.length > 0 ? (
                <section className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {[...scoringSessions].reverse().map((session) => (
                    <ScoreCheck key={session.sessionId} session={session} />
                  ))}
                </section>
              ) : null}

              {scoringSessions.length > 0 ? <hr className="border-[#e8e4da]" /> : null}

              <section>
                <SectionTitle
                  icon={<BoltIcon />}
                  title="Latest Events"
                  action={
                    timeline.length > 5 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllEvents((current) => !current)}
                        className="text-xs font-medium text-[#245a8a] hover:underline"
                      >
                        {showAllEvents ? "Show less" : "View all"}
                      </button>
                    ) : undefined
                  }
                />
                <div className={`space-y-1 ${showAllEvents ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
                  {timeline.length > 0 ? (
                    displayedEvents.map((entry) => (
                      <EventRow
                        key={entry.id}
                        label={entry.label}
                        timestamp={entry.timestamp}
                        detail={entry.detail}
                      />
                    ))
                  ) : (
                    <div className="rounded-[0.9rem] border border-dashed border-[#d8d1c4] bg-white/60 px-3 py-4 text-xs leading-5 text-[#7a7469]">
                      Waiting for the connection page to emit its first event.
                      {streamMode !== "idle" ? (
                        <span className="ml-1 inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#d7ff00]" />
                          {streamMode === "sse" ? "Live" : "Polling"}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : payload.metadataRequired ? (
            <section className="rounded-[1.2rem] border border-[#dfd8cb] bg-[#fbf8f3] p-4 text-sm leading-7 text-[#3f3b34]">
              Submit agent metadata on the connection page before the hosted suite is allocated.
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
