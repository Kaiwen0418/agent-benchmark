"use client";

import type { AgentIdentity } from "@agentbench/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyHostedSessionProgress,
  deriveHostedSessionProgressFromEvents,
  hasTerminalHostedSessionProgress,
} from "@/lib/hosted-progress";
import {
  buildRunConnectFailure,
  connectRetryDelaySeconds,
  type RunConnectFailure,
} from "@/lib/run-connect-error";
import { RunMetadataForm } from "./RunMetadataForm";
import { useHostedSessionPolling } from "@/hooks/use-hosted-session-polling";
import { isTerminalRunStatus } from "@/lib/hosted-session-polling";

type RunConnectPayload = {
  runId: string;
  status: string;
  errorMessage: string | null;
  metadataRequired: boolean;
  prompt: string;
  benchmark: {
    title: string;
    goal: string;
  };
  instructions: string[];
  hostedNote: {
    note: string;
  };
  hostedWeb: {
    available: boolean;
    attemptId: string | null;
    suiteSlug: string | null;
    suiteVersion: string | null;
    orchestratorUrl: string | null;
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
      sequenceIndex: number;
      goal: string;
      title: string | null;
      status: string;
    }>;
  };
};

type StreamPayload = {
  run: {
    status: string;
    errorMessage?: string | null;
  } | null;
  events: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
};

function sessionTone(status: string) {
  if (status === "completed") {
    return "bg-[#e8f7ec] text-[#1f6b35]";
  }
  if (status === "failed" || status === "expired") {
    return "bg-[#fff1ed] text-[#8a2d1f]";
  }
  if (status === "active") {
    return "bg-[#eef6ff] text-[#245a8a]";
  }
  return "bg-[#efede6] text-[#4d483f]";
}

export function RunConnectClient({
  runId,
  benchmarkTitle,
  benchmarkGoal,
  initialAgent,
  initialMetadata,
  initiallyRegistered,
  metadataLocked,
}: {
  runId: string;
  benchmarkTitle: string;
  benchmarkGoal: string;
  initialAgent: AgentIdentity | null;
  initialMetadata: Record<string, unknown>;
  initiallyRegistered: boolean;
  metadataLocked: boolean;
}) {
  const [registered, setRegistered] = useState(initiallyRegistered);
  const [payload, setPayload] = useState<RunConnectPayload | null>(null);
  const [connectError, setConnectError] = useState<RunConnectFailure | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [hostedEvents, setHostedEvents] = useState<StreamPayload["events"]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [progressPollingComplete, setProgressPollingComplete] = useState(false);
  const [now, setNow] = useState(Date.now());
  const connectionInFlight = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const loadConnection = useCallback(async (quiet = false) => {
    if (connectionInFlight.current) {
      return;
    }
    connectionInFlight.current = true;

    if (!quiet) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(`/api/runs/${runId}/connect`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setConnectError(buildRunConnectFailure(response.status, response.headers, result));
        return;
      }

      const nextPayload = result as RunConnectPayload;
      setPayload(nextPayload);
      setRegistered(!nextPayload.metadataRequired);
      setProgressPollingComplete(false);
      setConnectError(null);
    } catch (loadError) {
      setConnectError(buildRunConnectFailure(503, new Headers(), {
        message: loadError instanceof Error ? loadError.message : "Unable to load the active benchmark.",
        retryable: true,
      }));
    } finally {
      connectionInFlight.current = false;
      if (!quiet) {
        setRefreshing(false);
      }
    }
  }, [runId]);

  useEffect(() => {
    if (!registered) {
      return;
    }

    void loadConnection();
  }, [loadConnection, registered]);

  const { sessions: progressSessions, error: hostedProgressError } = useHostedSessionPolling({
    runId,
    enabled: registered && Boolean(payload) && !progressPollingComplete,
    terminal: isTerminalRunStatus(payload?.status),
  });
  const eventProgressSessions = useMemo(() => deriveHostedSessionProgressFromEvents(hostedEvents), [hostedEvents]);
  const effectiveProgressSessions = eventProgressSessions.length > 0 ? eventProgressSessions : progressSessions;
  const hasConnectionPayload = Boolean(payload);

  useEffect(() => {
    if (!registered || !hasConnectionPayload) {
      return;
    }

    const source = new EventSource(`/api/runs/${runId}/stream`);

    source.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse((event as MessageEvent<string>).data) as StreamPayload;
      setHostedEvents(snapshot.events.filter((item) => item.type.startsWith("hosted.")));
      setPayload((current) => current ? {
        ...current,
        status: snapshot.run?.status ?? current.status,
        errorMessage: snapshot.run?.errorMessage ?? current.errorMessage,
      } : current);
    });

    source.addEventListener("terminal", () => {
      source.close();
    });

    source.addEventListener("error", (event) => {
      if (event instanceof MessageEvent) {
        source.close();
      }
    });

    return () => {
      source.close();
    };
  }, [hasConnectionPayload, registered, runId]);

  useEffect(() => {
    if (effectiveProgressSessions.length === 0) return;
    setPayload((current) => current ? applyHostedSessionProgress(current, effectiveProgressSessions) : current);
    setProgressPollingComplete(hasTerminalHostedSessionProgress(effectiveProgressSessions));
  }, [effectiveProgressSessions]);

  useEffect(() => {
    setProgressError(hostedProgressError);
  }, [hostedProgressError]);

  const activeSession = payload?.hostedWeb.sessions.find(
    (session) => session.sessionId === payload.hostedWeb.activeSessionId,
  ) ?? null;
  const isTerminal =
    payload?.status === "completed" ||
    payload?.status === "failed" ||
    payload?.status === "cancelled" ||
    payload?.status === "timeout";
  const actionLabel = payload && payload.hostedWeb.progress.completed > 0
    ? "Proceed to next case"
    : "Open first case";
  const retryDelay = connectError ? connectRetryDelaySeconds(connectError, now) : null;
  const canRetryConnect = retryDelay !== null;
  const retryDisabled = typeof retryDelay === "number" && retryDelay > 0;

  return (
    <main className="min-h-screen bg-[#f5f0e6] px-6 py-10 text-[#111111] md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[2rem] border border-[#d8d1c4] bg-[#faf7f1] p-6 shadow-[0_24px_80px_rgba(17,17,17,0.08)] md:p-8">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">AgentBench Run Connection</div>
          <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            {benchmarkTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#66625a]">{benchmarkGoal}</p>

          <RunMetadataForm
            runId={runId}
            initialAgent={initialAgent}
            initialMetadata={initialMetadata}
            locked={metadataLocked}
            onSaved={() => {
              setRegistered(true);
              setPayload(null);
              setProgressPollingComplete(false);
            }}
          />

          {!registered ? (
            <section className="mt-8 rounded-[1.4rem] border border-[#d8d1c4] bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Metadata required</div>
              <p className="mt-3 text-sm leading-7 text-[#4f4a43]">
                Submit the agent identity above to allocate the suite and reveal the active case.
              </p>
            </section>
          ) : null}

          {registered && !payload ? (
            <section className="mt-8 rounded-[1.4rem] border border-[#d8d1c4] bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Loading suite</div>
              <p className="mt-3 text-sm leading-7 text-[#4f4a43]">
                {connectError?.message ?? "Allocating the hosted suite and resolving the active case."}
              </p>
              {connectError && canRetryConnect ? (
                <button
                  type="button"
                  onClick={() => void loadConnection()}
                  disabled={retryDisabled || refreshing}
                  className="mt-4 rounded-full bg-[#111111] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#aaa59c]"
                >
                  {refreshing ? "Retrying..." : retryDisabled ? `Retry in ${retryDelay}s` : "Retry"}
                </button>
              ) : null}
            </section>
          ) : null}

          {payload ? (
            <>
              {progressError ? (
                <div className="mt-6 rounded-[1rem] border border-[#ead2ca] bg-[#fff0eb] p-3 text-sm text-[#8a4334]">
                  Progress refresh failed: {progressError}. Retrying automatically.
                </div>
              ) : null}

              <div className="mt-8 grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-[1.4rem] border border-[#ddd6ca] bg-white p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Instructions For Agents</div>
                  <ol className="mt-4 space-y-3 text-sm leading-7 text-[#302d29]">
                    {payload.instructions.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                </section>

                <section className="rounded-[1.4rem] border border-[#ddd6ca] bg-[#f1eee7] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Hosted Suite</div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#756e62]">
                      {refreshing ? "Refreshing" : "Live"}
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#4f4a43]">{payload.hostedNote.note}</p>
                  <div className="mt-5 rounded-[1rem] bg-[#111111] px-4 py-3 text-sm text-white">
                    Suite: <span className="font-medium">{payload.hostedWeb.suiteSlug ?? "hosted-web"}</span>
                    <br />
                    Active Case: <span className="font-medium">
                      {activeSession ? activeSession.title ?? activeSession.taskSlug : "none"}
                    </span>
                    <br />
                    Progress: <span className="font-medium">
                      {payload.hostedWeb.progress.completed} / {payload.hostedWeb.progress.total}
                    </span>
                  </div>
                  {payload.hostedWeb.orchestratorUrl && activeSession && !isTerminal ? (
                    <a
                      href={payload.hostedWeb.orchestratorUrl}
                      className="mt-4 inline-flex rounded-full bg-[#111111] px-5 py-2.5 text-sm font-medium text-white"
                    >
                      {actionLabel}
                    </a>
                  ) : (
                    <div className="mt-4 rounded-[1rem] border border-[#d8d1c4] bg-white px-4 py-3 text-sm text-[#4f4a43]">
                      {isTerminal ? "The suite is complete." : "Waiting for the next active case."}
                    </div>
                  )}
                </section>
              </div>

              <section className="mt-6 rounded-[1.4rem] border border-[#ddd6ca] bg-white p-5">
                <div className="mb-5 grid gap-3">
                  {payload.hostedWeb.sessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="flex items-start justify-between gap-3 rounded-[1rem] border border-[#e4ddd1] bg-[#faf7f1] px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-[#111111]">{session.title ?? session.taskSlug}</div>
                        <div className="mt-1 text-xs text-[#6b655b]">Case {session.sequenceIndex + 1} · {session.app}</div>
                        {session.status === "active" ? (
                          <div className="mt-2 text-sm leading-7 text-[#4f4a43]">{session.goal}</div>
                        ) : null}
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${sessionTone(session.status)}`}>
                        {session.status.replaceAll("-", " ")}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Current Prompt</div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1rem] bg-[#f6f3ed] p-4 text-sm leading-7 text-[#25221d]">
                  {payload.prompt}
                </pre>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
