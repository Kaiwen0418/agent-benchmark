"use client";

import { HeroMacFrame } from "./HeroMacFrame";
import { cn } from "@/lib/utils";

const stats = [
  { label: "Practical Tasks", value: "Real workflows, not toy demos" },
  { label: "Reproducible Runs", value: "Same task, same rules" },
  { label: "Full Trace", value: "Events, tools, and state" },
  { label: "Stable Scoring", value: "Comparable results" },
];

export function HeroSection({
  showDevice = true,
  embedded = false,
  sectionId,
}: {
  showDevice?: boolean;
  embedded?: boolean;
  sectionId?: string;
}) {
  return (
    <section
      id={sectionId}
      className={cn(
        "relative overflow-hidden snap-start",
        embedded
          ? "min-h-[100svh] flex flex-col justify-center pb-16 pt-8"
          : "min-h-screen px-6 pb-16 pt-8 md:px-10 lg:px-16",
      )}
    >
      <div className={cn(embedded ? "" : "mx-auto max-w-7xl")}>
        <div className={cn("grid items-center gap-12", showDevice && "lg:grid-cols-[0.9fr_1.1fr]")}>
          <div>
            <h1 className="max-w-xl text-[3.4rem] font-[350] leading-[0.96] tracking-[-0.08em] text-[#111111] md:text-[5.4rem]">
              <span className="block">Benchmark agents</span>
              <span className="block font-medium">in the browser.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#66625a]">
              Run practical, reproducible web tasks and inspect every event, tool call, and state change in real time.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#playground"
                className="inline-flex items-center justify-center rounded-full bg-[#111111] px-7 py-4 text-base text-white transition hover:bg-[#d7ff00] hover:text-[#111111]"
              >
                Run Your Agent
              </a>
              <div className="rounded-full bg-[#f0f0ed] px-6 py-4 text-base font-medium text-[#111111]">
                1 free run today
              </div>
            </div>
            <div className="mt-10 grid max-w-[35rem] gap-3 sm:grid-cols-2">
              {stats.map((item, index) => (
                <div
                  key={item.label}
                  className={`rounded-[1.6rem] p-5 ${
                    index === 0
                      ? "bg-[#d7ff00] text-[#111111]"
                      : index === 2
                        ? "bg-[#111111] text-white"
                        : "bg-[#f1f1ee] text-[#111111]"
                  }`}
                >
                    <div className="text-[13px] opacity-70">{item.label}</div>
                    <div className="mt-1.5 text-[16px] font-medium leading-6">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          {showDevice ? <HeroMacFrame /> : null}
        </div>

        <div className="mt-10 flex items-center gap-3 text-sm text-[#66625a]">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d2cdc2]">
            ↓
          </span>
          Scroll into the playground and trigger a live mock run.
        </div>
      </div>
    </section>
  );
}
