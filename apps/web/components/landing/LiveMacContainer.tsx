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
  const statusLine = usePlaygroundStore((state) => state.statusLine);
  const bootMessages = usePlaygroundStore((state) => state.bootMessages);

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
  }, [liveSlide, phase, score]);

  return (
    <div className="mac-crt-ui">
      <div className="mac-sidebar">
        <div className="mac-sidebar-item is-active">Run</div>
        <div className="mac-sidebar-item">Events</div>
        <div className="mac-sidebar-item">Files</div>
        <div className="mac-sidebar-item">Score</div>
        <div className="mac-sidebar-item">Replay</div>
      </div>
      <div className="mac-window-area">
        <div className="flex items-center justify-between">
          <div className="mac-os-label">Live Sandbox</div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-white">
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
        <div className="mac-window mt-2">
          <div className="mac-window-header">
            <span>{slide.accent}</span>
            <span>stream</span>
          </div>
          <div className="rounded-[0.75rem] bg-[#f6f2e8] p-2.5 text-[#141414]">
            <div className="mb-2 text-[8px] uppercase tracking-[0.16em] text-[#7b7469]">
              Browser View
            </div>
            <div className="rounded-[0.75rem] bg-white p-2.5 shadow-[inset_0_0_0_1px_rgba(17,17,17,0.06)]">
              <div className="mb-2 flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#ff7d59]" />
                <span className="h-2 w-2 rounded-full bg-[#ffd84d]" />
                <span className="h-2 w-2 rounded-full bg-[#4bd776]" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-3/4 rounded-full bg-[#ece6d7]" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-12 rounded-[0.75rem] bg-[#efe8d5]" />
                  <div className="h-12 rounded-[0.75rem] bg-[#ddd3be]" />
                </div>
                <div className="h-7 rounded-[0.75rem] bg-[#f3efe4]" />
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[0.8rem] bg-[#0d0d0d] p-2.5 font-mono text-[9px] leading-4 text-[#d7ff00]">
              <div className="mb-2 text-[8px] uppercase tracking-[0.16em] text-white/50">
                Status
              </div>
              <div>{slide.title}</div>
              <div className="mt-1 text-white/75">{slide.body}</div>
              <div className="mt-3 text-[#cbc3b4]">{statusLine}</div>
            </div>
            <div className="rounded-[0.8rem] bg-[#0d0d0d] p-2.5 text-white">
              <div className="mb-2 text-[8px] uppercase tracking-[0.16em] text-white/50">
                Score
              </div>
              <div className="text-[1.6rem] font-medium">{score ?? "--"}</div>
              <div className="mt-3 space-y-1 font-mono text-[9px] leading-4 text-[#cbc3b4]">
                {bootMessages.slice(-3).map((message, index) => (
                  <div key={`${message}-${index}`}>{">"} {message}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveMacContainer() {
  return <HeroMacFrame screenContent={<LiveMacScreenContent />} />;
}
