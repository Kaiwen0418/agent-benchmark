"use client";

import { usePlaygroundStore } from "@/lib/playground-store";
import { ConnectAgentCard } from "./ConnectAgentCard";
import { LiveMacContainer } from "./LiveMacContainer";
import { RunPanels } from "./RunPanels";
import { ToolCallTimeline } from "./ToolCallTimeline";
import { cn } from "@/lib/utils";

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
  const hasActiveRun = phase !== "idle";

  return (
    <section
      id={sectionId}
      className={cn(
        embedded ? "min-h-[100svh] py-20" : "px-6 py-24 md:px-10 lg:px-16",
      )}
    >
      <div className={cn(embedded ? "" : "mx-auto max-w-7xl")}>
        <div className="mb-10 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Run Playground</div>
          <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            Connect an agent and immediately watch it work.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#66625a]">
            The point is not a control panel. The point is the feeling of observing an agent think through a browser task with live feedback.
          </p>
        </div>

        <div className={cn("grid gap-6", showLivePreview && "lg:grid-cols-[0.42fr_0.58fr]")}>
          <ConnectAgentCard />
          {showLivePreview ? <LiveMacContainer /> : null}
        </div>
        {hasActiveRun ? (
          <>
            <div className="mt-6">
              <ToolCallTimeline />
            </div>
            <div className="mt-6">
              <RunPanels />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
