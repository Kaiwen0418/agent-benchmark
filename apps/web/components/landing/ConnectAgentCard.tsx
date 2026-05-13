"use client";

import { benchmarkOptions } from "./data";
import { usePlaygroundStore } from "@/lib/playground-store";

export function ConnectAgentCard() {
  const endpoint = usePlaygroundStore((state) => state.endpoint);
  const apiKey = usePlaygroundStore((state) => state.apiKey);
  const benchmark = usePlaygroundStore((state) => state.benchmark);
  const phase = usePlaygroundStore((state) => state.phase);
  const setEndpoint = usePlaygroundStore((state) => state.setEndpoint);
  const setApiKey = usePlaygroundStore((state) => state.setApiKey);
  const setBenchmark = usePlaygroundStore((state) => state.setBenchmark);
  const startRun = usePlaygroundStore((state) => state.startRun);
  const reset = usePlaygroundStore((state) => state.reset);

  return (
    <div className="rounded-[2rem] border border-[#d7d0c4] bg-[#f9f7f1] p-6 shadow-[0_18px_60px_rgba(17,17,17,0.06)]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Connect Agent</div>
          <h3 className="mt-2 text-2xl font-medium text-[#111111]">Start a benchmark run</h3>
        </div>
        <div className="rounded-full bg-[#d7ff00] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[#111111]">
          Free quota
        </div>
      </div>

      <div className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm text-[#5d574d]">MCP endpoint</span>
          <input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://agent.local/mcp"
            className="w-full rounded-2xl border border-[#d8d1c4] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-[#5d574d]">Optional auth token</span>
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="agnt_..."
            className="w-full rounded-2xl border border-[#d8d1c4] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-[#5d574d]">Benchmark</span>
          <select
            value={benchmark}
            onChange={(event) => setBenchmark(event.target.value as typeof benchmark)}
            className="w-full rounded-2xl border border-[#d8d1c4] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
          >
            {benchmarkOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-[1.5rem] bg-[#efede6] p-4 text-sm text-[#5c574d]">
          {benchmarkOptions.find((item) => item.value === benchmark)?.description}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={startRun}
            disabled={phase === "booting" || phase === "running"}
            className="flex-1 rounded-full bg-[#111111] px-5 py-4 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {phase === "booting" || phase === "running" ? "Agent Running" : "Start Free Run"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-[#d8d1c4] px-5 py-4 text-sm text-[#111111]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
