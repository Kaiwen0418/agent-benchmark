"use client";

import { useEffect, useState } from "react";
import type { HostedSessionBreakdown } from "@/lib/hosted-scoring";
import { usePlaygroundStore } from "@/lib/playground-store";
import { ServiceUnavailableDialog } from "./ServiceUnavailableDialog";
import type { HostedSessionDeadline } from "@/lib/hosted-web";
import {
  buildRunConnectFailure,
  connectRetryDelaySeconds,
  type RunConnectFailure,
} from "@/lib/run-connect-error";

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
  selectedIndex,
  onSelect,
}: {
  sessions: RunConnectPayload["hostedWeb"]["sessions"];
  currentIndex: number | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const sorted = [...sessions].sort((left, right) => left.sequenceIndex - right.sequenceIndex);

  return (
    <div className="relative flex w-full items-center justify-between">
      <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#e2ddd3]" />
      {sorted.map((session, index) => {
        const isPassed = session.status === "completed";
        const isFailed = session.status === "failed";
        const isExpired = session.status === "expired" || session.status === "timeout";
        const isCurrent = index === currentIndex;
        const isSelected = index === selectedIndex;
        return (
          <button
            key={session.sessionId}
            type="button"
            onClick={() => onSelect(index)}
            title={`Session ${index + 1}`}
            className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
              isPassed
                ? "bg-[#4da66a] text-white"
                : isFailed
                  ? "bg-[#d45b45] text-white"
                  : isExpired
                    ? "bg-[#ff8f6b] text-[#111111]"
                    : isCurrent
                      ? "bg-[#d7ff00] text-[#111111]"
                      : "border border-[#d8d1c4] bg-white text-[#6a655c]"
            } ${isSelected ? "ring-2 ring-[#111111]/25" : ""}`}
          >
            {isPassed ? <CheckIcon /> : index + 1}
          </button>
        );
      })}
    </div>
  );
}

function SessionDetailPanel({
  session,
  score,
  isActive,
  countdownText,
  countdownUrgent,
}: {
  session: RunConnectPayload["hostedWeb"]["sessions"][number];
  score: HostedSessionBreakdown | null;
  isActive: boolean;
  countdownText: string | null;
  countdownUrgent: boolean;
}) {
  return (
    <div className="rounded-[1rem] border border-[#e8e4da] bg-[#fbf8f3] px-4 py-3">
      <div className="text-sm font-semibold text-[#111111]">{session.title ?? session.taskSlug}</div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wider">
        {isActive && countdownText ? (
          <span className={`font-semibold ${countdownUrgent ? "text-[#d45b45]" : "text-[#6a655c]"}`}>
            {countdownText}
          </span>
        ) : (
          <span className="text-[#8f897e]">{session.app}</span>
        )}
        {score ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
              score.status === "passed" ? "bg-[#e8f7ec] text-[#1f6b35]" : "bg-[#fff1ed] text-[#8a2d1f]"
            }`}
          >
            {Math.round(score.score * 100)}%
          </span>
        ) : null}
      </div>
      <p className="scroll-panel max-h-40 overflow-y-auto py-1 text-xs leading-5 text-[#585248]">
        {session.goal}
      </p>
      {score && score.evaluators.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-[#e2ddd3] pt-3">
          {score.evaluators.map((evaluator) => (
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
  const [payload, setPayload] = useState<RunConnectPayload | null>(null);
  const [connectError, setConnectError] = useState<RunConnectFailure | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [eventPage, setEventPage] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    setEventPage(0);
  }, [timeline.length]);

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
        const errorPayload = await response.json().catch(() => null);
        if (!cancelled) {
          setConnectError(buildRunConnectFailure(response.status, response.headers, errorPayload));
        }
        return;
      }

      const nextPayload = (await response.json()) as RunConnectPayload;
      if (!cancelled) {
        setPayload(nextPayload);
        setConnectError(null);
      }
    };

    void load().catch((error: Error) => {
      if (!cancelled) {
        setConnectError(buildRunConnectFailure(503, new Headers(), {
          error: "run_connect_failed",
          message: error.message || "Failed to load run connection info.",
          retryable: true,
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [runId, retryNonce]);

  useEffect(() => {
    const currentIndex = payload?.hostedWeb.progress.currentIndex;
    if (currentIndex !== null && currentIndex !== undefined) {
      setSelectedSessionIndex(currentIndex);
    }
  }, [payload?.hostedWeb.progress.currentIndex]);

  if (!runId || executionMode !== "external-agent") {
    return null;
  }

  if (!payload) {
    const retryDelay = connectError ? connectRetryDelaySeconds(connectError, now) : null;
    const canRetry = retryDelay !== null;
    const retryDisabled = typeof retryDelay === "number" && retryDelay > 0;
    const retryLabel = retryDisabled ? `Retry in ${retryDelay}s` : "Retry connection";

    return (
      <>
        {connectError ? (
          <ServiceUnavailableDialog
            message={connectError.message}
            onClose={() => setConnectError(null)}
            onRetry={canRetry ? () => setRetryNonce((value) => value + 1) : undefined}
            retryDisabled={retryDisabled}
            retryLabel={retryLabel}
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
              {canRetry ? (
                <button
                  type="button"
                  onClick={() => setRetryNonce((value) => value + 1)}
                  disabled={retryDisabled}
                  className="mt-4 rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#aaa59c]"
                >
                  {retryLabel}
                </button>
              ) : null}
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
  const scoringBySessionId = new Map(scoringSessions.map((session) => [session.sessionId, session]));
  const selectedSession = sortedSessions[selectedSessionIndex] ?? sortedSessions[0];
  const selectedScore = selectedSession ? (scoringBySessionId.get(selectedSession.sessionId) ?? null) : null;
  const isSelectedActive = selectedSession?.sessionId === payload.hostedWeb.activeSessionId;

  const countdownText = (() => {
    if (!isSelectedActive || !activeDeadline?.expiresAt) return null;
    const remaining = new Date(activeDeadline.expiresAt).getTime() - now;
    if (remaining <= 0) return "Timed out";
    return `Time left: ${formatCountdown(remaining)}`;
  })();
  const countdownUrgent = Boolean(
    isSelectedActive && activeDeadline?.expiresAt && new Date(activeDeadline.expiresAt).getTime() - now < 60_000,
  );

  const eventsPerPage = 6;
  const reversedEvents = [...timeline].reverse();
  const eventPageCount = Math.max(1, Math.ceil(reversedEvents.length / eventsPerPage));
  const safeEventPage = Math.min(eventPage, eventPageCount - 1);
  const pagedEvents = reversedEvents.slice(
    safeEventPage * eventsPerPage,
    (safeEventPage + 1) * eventsPerPage,
  );

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
            className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] ${
              isTerminalRun
                ? statusBadgeTone(payload.status)
                : isActive
                  ? "bg-[#d7ff00] text-[#111111]"
                  : "bg-[#efede6] text-[#4d483f]"
            }`}
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
                  selectedIndex={selectedSessionIndex}
                  onSelect={setSelectedSessionIndex}
                />
                {selectedSession ? (
                  <div className="mt-4">
                    <SessionDetailPanel
                      session={selectedSession}
                      score={selectedScore}
                      isActive={isSelectedActive}
                      countdownText={countdownText}
                      countdownUrgent={countdownUrgent}
                    />
                  </div>
                ) : null}
              </section>

              <hr className="border-[#e8e4da]" />

              <section>
                <SectionTitle
                  icon={<BoltIcon />}
                  title="Latest Events"
                  action={
                    eventPageCount > 1 ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safeEventPage === 0}
                          onClick={() => setEventPage((page) => Math.max(0, page - 1))}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-[#d8d1c4] bg-white text-[10px] text-[#111111] disabled:opacity-40"
                        >
                          ←
                        </button>
                        <span className="text-[10px] tabular-nums text-[#6a655c]">
                          {safeEventPage + 1} / {eventPageCount}
                        </span>
                        <button
                          type="button"
                          disabled={safeEventPage === eventPageCount - 1}
                          onClick={() => setEventPage((page) => Math.min(eventPageCount - 1, page + 1))}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-[#d8d1c4] bg-white text-[10px] text-[#111111] disabled:opacity-40"
                        >
                          →
                        </button>
                      </div>
                    ) : undefined
                  }
                />
                <div className="space-y-1">
                  {timeline.length > 0 ? (
                    pagedEvents.map((entry) => (
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
