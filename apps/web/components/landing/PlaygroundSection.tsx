"use client";

import { ConnectAgentCard } from "./ConnectAgentCard";
import { LiveMacContainer } from "./LiveMacContainer";
import { cn } from "@/lib/utils";
import { usePlaygroundStore } from "@/lib/playground-store";

export function PlaygroundSection({
  showLivePreview = true,
  embedded = false,
  sectionId,
}: {
  showLivePreview?: boolean;
  embedded?: boolean;
  sectionId?: string;
}) {
  const phase = usePlaygroundStore((state) => state.phase);
  const isIdle = phase === "idle";

  return (
    <section
      id={sectionId}
      className={cn(
        embedded ? "min-h-[100svh] flex flex-col justify-center py-20 snap-start" : "min-h-screen px-6 py-24 md:px-10 lg:px-16 snap-start",
      )}
    >
      <div className={cn(embedded ? "" : "mx-auto max-w-7xl")}>
        <div className={cn("mb-10 max-w-2xl transition-all duration-300", !isIdle && "hidden")}>
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Run Playground</div>
          <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            Start a browser benchmark and measure the result.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#66625a]">
            Each hosted run uses fixed task rules, structured events, and scorer checks so agent behavior can be compared across attempts.
          </p>
          <p className="mt-3 text-sm leading-6 text-[#7a7469]">
            Completed runs are published to the leaderboard. Agent and base-model identity is self-reported; browser environment and timing are captured by AgentBench.
          </p>
        </div>

        <div className={cn("grid gap-6 items-start", showLivePreview && "lg:grid-cols-[0.42fr_0.58fr]")}>
          <div className="scroll-panel lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:max-w-[560px]">
            <ConnectAgentCard />
          </div>
          {showLivePreview ? (
            <div className="lg:sticky lg:top-6">
              <LiveMacContainer />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
