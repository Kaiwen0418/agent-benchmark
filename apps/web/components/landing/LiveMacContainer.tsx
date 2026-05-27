"use client";

import { useMemo } from "react";
import { HeroMacFrame } from "./HeroMacFrame";
import { usePlaygroundStore } from "@/lib/playground-store";

const browserSlides = [
  {
    title: "Idle desktop",
    body: "Run a benchmark to see your agent in action.",
    accent: "Awaiting connection",
  },
  {
    title: "Sandbox boot",
    body: "Initializing sandbox and validating endpoint permissions.",
    accent: "Booting",
  },
  {
    title: "Browser search",
    body: "Search results are being parsed and ranked by the agent.",
    accent: "browser.goto()",
  },
  {
    title: "Document handling",
    body: "Artifacts are being written into an isolated workspace.",
    accent: "file.write()",
  },
  {
    title: "Policy check",
    body: "Blocked actions surface as explicit safety events instead of silent failures.",
    accent: "policy.block()",
  },
];

export function LiveMacScreenContent() {
  const phase = usePlaygroundStore((state) => state.phase);
  const score = usePlaygroundStore((state) => state.score);
  const liveSlide = usePlaygroundStore((state) => state.liveSlide);
  const liveFrameUrl = usePlaygroundStore((state) => state.liveFrameUrl);
  const liveViewUrl = usePlaygroundStore((state) => state.liveViewUrl);

  const slide = useMemo(() => {
    if (phase === "idle") {
      return browserSlides[0];
    }

    if (phase === "completed") {
      return {
        title: "Run completed",
        body: `Replay captured. Score ${score ?? 0}.`,
        accent: "completed",
      };
    }

    if (phase === "failed") {
      return {
        title: "Run failed",
        body: "The agent hit a boundary condition before completion.",
        accent: "error",
      };
    }

    return browserSlides[Math.min(liveSlide, browserSlides.length - 1)];
  }, [liveSlide, phase]);

  const embeddedLiveViewUrl = useMemo(() => {
    if (!liveViewUrl) {
      return null;
    }

    try {
      const base =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const url = new URL(liveViewUrl, base);
      url.searchParams.set("embed", "1");
      return url.toString();
    } catch {
      return `${liveViewUrl}${liveViewUrl.includes("?") ? "&" : "?"}embed=1`;
    }
  }, [liveViewUrl]);

  return (
    <div className="relative h-full overflow-hidden rounded-[1.05rem] bg-[#080808] text-white">
      {embeddedLiveViewUrl ? (
        <iframe
          src={embeddedLiveViewUrl}
          title="Embedded live run viewer"
          className="absolute inset-0 h-full w-full border-0 bg-[#111111]"
        />
      ) : liveFrameUrl ? (
        <img
          src={liveFrameUrl}
          alt="Live browser frame"
          className="absolute inset-0 h-full w-full bg-[#111111] object-contain"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(215,255,0,0.12),transparent_42%),linear-gradient(180deg,#141414_0%,#090909_100%)]" />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end p-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[8px] uppercase tracking-[0.16em] text-white">
          <span
            className={`h-2 w-2 rounded-full ${
              phase === "completed"
                ? "bg-[#d7ff00]"
                : phase === "failed"
                  ? "bg-[#ff8f6b]"
                  : phase === "idle"
                    ? "bg-[#8d867b]"
                    : "bg-[#6df6a4]"
            }`}
          />
          {phase}
        </div>
      </div>

      {!(embeddedLiveViewUrl || liveFrameUrl) ? (
        <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-4 text-center">
          <div className="mx-auto max-w-[11rem] rounded-[1rem] border border-white/10 bg-black/45 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#d7ff00]">{slide.title}</div>
            <div className="mt-2 text-[10px] leading-4 text-[#d0c8ba]">{slide.body}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LiveMacContainer() {
  return <HeroMacFrame screenContent={<LiveMacScreenContent />} />;
}
