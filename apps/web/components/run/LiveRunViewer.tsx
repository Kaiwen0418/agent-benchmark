"use client";

import { useEffect, useState } from "react";

type LiveRunViewerProps = {
  runId: string;
  initialTitle: string;
  initialStatus: string;
  initialScore: number | null;
  initialErrorMessage: string | null;
  initialFrameUrl: string | null;
  embedded?: boolean;
};

type StreamPayload = {
  run: {
    id: string;
    status: string;
    score: number | null;
    errorMessage?: string | null;
  } | null;
  events: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
  artifacts: Array<{
    type: string;
    url: string | null;
  }>;
};

type StreamEvent = StreamPayload["events"][number];
type HostedSuiteSession = {
  sessionId: string;
  app: string;
  taskSlug: string;
  sequenceIndex: number;
  startUrl: string | null;
};

function deriveLiveFrameUrl(payload: StreamPayload) {
  const liveEvent = [...payload.events]
    .reverse()
    .find((event) => event.type === "live.frame" && typeof event.payload.url === "string");

  if (liveEvent && typeof liveEvent.payload.url === "string") {
    return liveEvent.payload.url;
  }

  const latestScreenshot = [...payload.artifacts]
    .reverse()
    .find((artifact) => artifact.type === "screenshot" && typeof artifact.url === "string");

  return latestScreenshot?.url ?? null;
}

function deriveScore(payload: StreamPayload, fallback: number | null) {
  if (typeof payload.run?.score === "number") {
    return payload.run.score;
  }

  const hostedScore = [...payload.events]
    .reverse()
    .find((event) => event.type === "hosted.score" && typeof event.payload.score === "number");

  return typeof hostedScore?.payload.score === "number" ? hostedScore.payload.score : fallback;
}

function hostedEventLabel(event: StreamEvent) {
  if (event.type === "hosted.session.created") {
    return "Hosted session created";
  }

  if (event.type === "hosted.page.load") {
    return `Page loaded${typeof event.payload.title === "string" ? `: ${event.payload.title}` : ""}`;
  }

  if (event.type === "hosted.task_signal") {
    return `Task signal: ${String(event.payload.name ?? "unknown")}`;
  }

  if (event.type === "hosted.score") {
    return `Score ${String(event.payload.score ?? "--")}`;
  }

  if (event.type === "hosted.action") {
    return `Action: ${String(event.payload.type ?? "unknown")}`;
  }

  return event.type;
}

function deriveHostedSuiteSessions(events: StreamEvent[]) {
  const sessions = new Map<string, HostedSuiteSession>();

  for (const event of events) {
    if (event.type !== "hosted.session.created" || typeof event.payload.sessionId !== "string") {
      continue;
    }

    sessions.set(event.payload.sessionId, {
      sessionId: event.payload.sessionId,
      app: typeof event.payload.app === "string" ? event.payload.app : "hosted-app",
      taskSlug: typeof event.payload.taskSlug === "string" ? event.payload.taskSlug : "hosted-task",
      sequenceIndex:
        typeof event.payload.sequenceIndex === "number" && Number.isFinite(event.payload.sequenceIndex)
          ? event.payload.sequenceIndex
          : sessions.size,
      startUrl: typeof event.payload.startUrl === "string" ? event.payload.startUrl : null,
    });
  }

  return [...sessions.values()].sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}

export function LiveRunViewer(props: LiveRunViewerProps) {
  const {
    runId,
    initialTitle,
    initialStatus,
    initialScore,
    initialErrorMessage,
    initialFrameUrl,
    embedded = false,
  } = props;
  const [status, setStatus] = useState(initialStatus);
  const [score, setScore] = useState<number | null>(initialScore);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [frameUrl, setFrameUrl] = useState<string | null>(initialFrameUrl);
  const [hostedEvents, setHostedEvents] = useState<StreamEvent[]>([]);
  const [suiteSessions, setSuiteSessions] = useState<HostedSuiteSession[]>([]);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/stream`);

    source.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as StreamPayload;
      setStatus(payload.run?.status ?? initialStatus);
      setScore(deriveScore(payload, initialScore));
      setErrorMessage(payload.run?.errorMessage ?? initialErrorMessage);
      setFrameUrl(deriveLiveFrameUrl(payload));
      const nextHostedEvents = payload.events.filter((item) => item.type.startsWith("hosted."));
      setHostedEvents(nextHostedEvents.slice(-8));
      setSuiteSessions(deriveHostedSuiteSessions(nextHostedEvents));
    });

    source.addEventListener("terminal", () => {
      source.close();
    });

    source.addEventListener("error", () => {
      source.close();
    });

    return () => {
      source.close();
    };
  }, [initialScore, initialStatus, runId]);

  const terminalSummary =
    status === "timeout"
      ? errorMessage ?? "This hosted suite timed out."
      : status === "failed"
        ? errorMessage ?? "This run failed."
        : null;

  if (embedded) {
    return (
      <main className="h-full bg-[#111111] text-[#f7f2e7]">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[9px] uppercase tracking-[0.16em] text-[#8f897e]">
            <span className="truncate">browser-session.live</span>
            <span>{status}</span>
          </div>
          <div className="relative flex-1 bg-[#111111]">
            {frameUrl ? (
              <img
                src={frameUrl}
                alt="Live browser session"
                className="h-full w-full object-contain"
              />
            ) : (
              <HostedEventFallback events={hostedEvents} compact />
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-full bg-black/55 px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] text-[#f1ebde]">
              <span className="truncate">{initialTitle}</span>
              <span>Score {score ?? "--"}</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0f0d] px-6 py-8 text-[#f7f2e7] md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-[#8c877d]">AgentBench Live View</div>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] text-white md:text-4xl">
              {initialTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#d2ccc1]">
              Status: {status}
            </div>
            <div className="rounded-full bg-[#d7ff00] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[#111111]">
              Score: {score ?? "--"}
            </div>
          </div>
        </div>

        {terminalSummary ? (
          <section className="mb-6 rounded-[1.4rem] border border-[#6b2d22] bg-[#201311] p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-[#ffb7aa]">
              {status === "timeout" ? "Run timed out" : "Run failed"}
            </div>
            <p className="mt-2 text-sm leading-7 text-[#ffd8d1]">{terminalSummary}</p>
          </section>
        ) : null}

        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#181714] shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#8f897e]">
            <span>browser-session.live</span>
            <span>{runId}</span>
          </div>
          <div className="aspect-[16/10] bg-[#111111]">
            {frameUrl ? (
              <img
                src={frameUrl}
                alt="Live browser session"
                className="h-full w-full object-contain"
              />
            ) : (
              <HostedEventFallback events={hostedEvents} />
            )}
          </div>
        </div>

        {suiteSessions.length > 0 ? (
          <section className="mt-6 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-[#8f897e]">Hosted Suite Progress</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {suiteSessions.map((session, index) => (
                <div
                  key={session.sessionId}
                  className={`rounded-[1rem] border px-4 py-3 ${
                    status === "timeout" || status === "failed"
                      ? "border-[#6b2d22] bg-[#1b1312]"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f897e]">
                    Session {index + 1}
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">{session.taskSlug}</div>
                  <div className="mt-1 text-xs text-[#c8c2b5]">{session.app}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function HostedEventFallback({ events, compact = false }: { events: StreamEvent[]; compact?: boolean }) {
  if (events.length === 0) {
    return (
      <div className={`flex h-full items-center justify-center ${compact ? "text-[11px]" : "text-sm"} text-[#8f897e]`}>
        Waiting for hosted site activity...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-end gap-2 p-4">
      {events.map((event, index) => (
        <div
          key={`${event.type}-${index}`}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left"
        >
          <div className={`${compact ? "text-[9px]" : "text-xs"} uppercase tracking-[0.16em] text-[#8f897e]`}>
            {event.type}
          </div>
          <div className={`${compact ? "text-[11px]" : "text-sm"} mt-1 text-[#f7f2e7]`}>
            {hostedEventLabel(event)}
          </div>
        </div>
      ))}
    </div>
  );
}
