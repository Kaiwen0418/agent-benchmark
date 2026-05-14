"use client";

import { ConnectAgentCard } from "./ConnectAgentCard";
import { LiveMacContainer } from "./LiveMacContainer";
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
  return (
    <section
      id={sectionId}
      className={cn(
        embedded ? "min-h-[100svh] flex flex-col justify-center py-20 snap-start" : "min-h-screen px-6 py-24 md:px-10 lg:px-16 snap-start",
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

        <div className={cn("grid gap-6 items-start", showLivePreview && "lg:grid-cols-[0.42fr_0.58fr]")}>
          <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:max-w-[560px]">
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
