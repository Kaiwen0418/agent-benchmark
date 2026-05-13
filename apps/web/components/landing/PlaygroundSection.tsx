"use client";

import { ConnectAgentCard } from "./ConnectAgentCard";
import { LiveMacContainer } from "./LiveMacContainer";
import { RunPanels } from "./RunPanels";
import { ToolCallTimeline } from "./ToolCallTimeline";

export function PlaygroundSection() {
  return (
    <section id="playground" className="px-6 py-24 md:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Run Playground</div>
          <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            Connect an agent and immediately watch it work.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#66625a]">
            The point is not a control panel. The point is the feeling of observing an agent think through a browser task with live feedback.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
          <ConnectAgentCard />
          <LiveMacContainer />
        </div>
        <div className="mt-6">
          <ToolCallTimeline />
        </div>
        <div className="mt-6">
          <RunPanels />
        </div>
      </div>
    </section>
  );
}
