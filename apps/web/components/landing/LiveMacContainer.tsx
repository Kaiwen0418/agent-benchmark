"use client";

import { useMemo } from "react";
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

export function LiveMacContainer() {
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
    <div className="rounded-[2.2rem] border border-[#d8d0c3] bg-[#ece8df] p-5 shadow-[0_24px_70px_rgba(17,17,17,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.22em] text-[#6d675d]">Live Mac Screen</div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
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

      <div className="rounded-[2rem] bg-[#dcd6c7] p-5">
        <div className="rounded-[1.8rem] bg-[#111111] p-4">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b0b0b] p-5">
            <div className="crt-scanlines" />
            <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[1.2rem] border border-white/10 bg-[#161616] p-4">
                <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-[#9f9f97]">
                  <span>{slide.accent}</span>
                  <span>Stream</span>
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-[#f6f2e8] p-4 text-[#141414]">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7b7469]">Browser view</div>
                  <div className="mt-4 rounded-[1rem] bg-white p-4 shadow-[inset_0_0_0_1px_rgba(17,17,17,0.06)]">
                    <div className="mb-3 flex gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ff7d59]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ffd84d]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4bd776]" />
                    </div>
                    <div className="space-y-3">
                      <div className="h-6 w-3/4 rounded-full bg-[#ece6d7]" />
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="h-28 rounded-[1rem] bg-[#efe8d5]" />
                        <div className="h-28 rounded-[1rem] bg-[#ddd3be]" />
                      </div>
                      <div className="h-12 rounded-[1rem] bg-[#f3efe4]" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[1.2rem] border border-white/10 bg-[#171717] p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9f9f97]">Status</div>
                  <div className="mt-3 text-xl font-medium text-white">{slide.title}</div>
                  <p className="mt-3 text-sm leading-6 text-[#bfb8ab]">{slide.body}</p>
                  <div className="mt-5 rounded-[1rem] bg-[#0d0d0d] p-3 font-mono text-xs text-[#d7ff00]">
                    {statusLine}
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-[#171717] p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9f9f97]">Boot log</div>
                  <div className="mt-3 space-y-2 font-mono text-xs text-[#cbc3b4]">
                    {bootMessages.slice(-5).map((message, index) => (
                      <div key={`${message}-${index}`}>{">"} {message}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-[#171717] p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9f9f97]">Score</div>
                  <div className="mt-3 text-4xl font-medium text-white">{score ?? "--"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
