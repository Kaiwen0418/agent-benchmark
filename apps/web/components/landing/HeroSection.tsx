"use client";

import { ArrowDownRight } from "lucide-react";
import { HeroMacFrame } from "./HeroMacFrame";

const stats = [
  { label: "Live Replay", value: "Real-time browser watch" },
  { label: "Trace Depth", value: "Tool calls + state shifts" },
  { label: "Sandbox Feel", value: "Retro Mac live shell" },
  { label: "First Run", value: "Free playground pass" },
];

export function HeroSection() {
  return (
    <section id="hero" className="relative overflow-hidden px-6 pb-16 pt-8 md:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="text-sm font-medium tracking-[0.2em] text-[#4c4a46] uppercase">AgentBench</div>
          <a
            href="#playground"
            className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm text-white transition hover:bg-[#d7ff00] hover:text-[#111111]"
          >
            Start Run
            <ArrowDownRight className="h-4 w-4" />
          </a>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-6 inline-flex rounded-full bg-[#efeee9] px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-[#575249]">
              Free Run Available
            </div>
            <h1 className="max-w-xl text-[3.4rem] font-[350] leading-[0.96] tracking-[-0.08em] text-[#111111] md:text-[5.4rem]">
              <span className="block">Watch AI</span>
              <span className="block font-medium">use the computer.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#66625a]">
              Input your agent, press start, and watch it navigate a benchmark in real time. AgentBench is not a dashboard first. It is a live AI playground built for observability.
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
            <div className="mt-12 grid max-w-xl gap-4 sm:grid-cols-2">
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
                  <div className="text-sm opacity-70">{item.label}</div>
                  <div className="mt-2 text-lg font-medium">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <HeroMacFrame />
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
