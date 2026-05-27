"use client";

import { useEffect, useState } from "react";

type LiveRunViewerProps = {
  runId: string;
  initialTitle: string;
  initialStatus: string;
  initialScore: number | null;
  initialFrameUrl: string | null;
  embedded?: boolean;
};

type StreamPayload = {
  run: {
    id: string;
    status: string;
    score: number | null;
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

export function LiveRunViewer(props: LiveRunViewerProps) {
  const {
    runId,
    initialTitle,
    initialStatus,
    initialScore,
    initialFrameUrl,
    embedded = false,
  } = props;
  const [status, setStatus] = useState(initialStatus);
  const [score, setScore] = useState<number | null>(initialScore);
  const [frameUrl, setFrameUrl] = useState<string | null>(initialFrameUrl);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/stream`);

    source.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as StreamPayload;
      setStatus(payload.run?.status ?? initialStatus);
      setScore(payload.run?.score ?? initialScore);
      setFrameUrl(deriveLiveFrameUrl(payload));
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
              <div className="flex h-full items-center justify-center text-[11px] text-[#8f897e]">
                Waiting for first live frame...
              </div>
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
              <div className="flex h-full items-center justify-center text-sm text-[#8f897e]">
                Waiting for first live frame...
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
