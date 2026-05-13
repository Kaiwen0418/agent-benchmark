"use client";

import { useEffect } from "react";
import { benchmarkOptions } from "./data";
import { usePlaygroundStore } from "@/lib/playground-store";

export function ConnectAgentCard() {
  const endpoint = usePlaygroundStore((state) => state.endpoint);
  const apiKey = usePlaygroundStore((state) => state.apiKey);
  const benchmark = usePlaygroundStore((state) => state.benchmark);
  const phase = usePlaygroundStore((state) => state.phase);
  const quota = usePlaygroundStore((state) => state.quota);
  const quotaLoading = usePlaygroundStore((state) => state.quotaLoading);
  const runError = usePlaygroundStore((state) => state.runError);
  const setEndpoint = usePlaygroundStore((state) => state.setEndpoint);
  const setApiKey = usePlaygroundStore((state) => state.setApiKey);
  const setBenchmark = usePlaygroundStore((state) => state.setBenchmark);
  const fetchQuota = usePlaygroundStore((state) => state.fetchQuota);
  const startRun = usePlaygroundStore((state) => state.startRun);
  const reset = usePlaygroundStore((state) => state.reset);
  const isRunning = phase === "booting" || phase === "running";
  const isQuotaBlocked = Boolean(quota && quota.remaining <= 0);

  useEffect(() => {
    void fetchQuota();
  }, [fetchQuota]);

  const quotaBadge = quotaLoading
    ? "Loading quota"
    : quota
      ? quota.mode === "guest"
        ? `${Math.max(quota.remaining, 0)} guest run left`
        : `${Math.max(quota.remaining, 0)} of ${quota.limit} runs left`
      : "Quota unavailable";

  return (
    <div className="rounded-[1.6rem] border border-[#d7d0c4] bg-[#f9f7f1] p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Connect Agent</div>
          <h3 className="mt-1.5 text-[1.35rem] font-medium text-[#111111]">Start a benchmark run</h3>
        </div>
        <div className="rounded-full bg-[#d7ff00] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#111111]">
          {quotaBadge}
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[13px] text-[#5d574d]">MCP endpoint</span>
          <input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://agent.local/mcp"
            className="w-full rounded-[1rem] border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-[13px] text-[#5d574d]">Optional auth token</span>
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="agnt_..."
            className="w-full rounded-[1rem] border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-[13px] text-[#5d574d]">Benchmark</span>
          <select
            value={benchmark}
            onChange={(event) => setBenchmark(event.target.value as typeof benchmark)}
            className="w-full rounded-[1rem] border border-[#d8d1c4] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
          >
            {benchmarkOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-[1.15rem] bg-[#efede6] p-3.5 text-[13px] leading-6 text-[#5c574d]">
          {benchmarkOptions.find((item) => item.value === benchmark)?.description}
        </div>

        {runError ? (
          <div className="rounded-[1rem] border border-[#ead2ca] bg-[#fff0eb] p-3 text-[13px] leading-6 text-[#8a4334]">
            {runError}
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void startRun()}
            disabled={isRunning || quotaLoading || isQuotaBlocked}
            className="flex-1 rounded-full bg-[#111111] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRunning
              ? "Agent Running"
              : isQuotaBlocked
                ? quota?.mode === "guest"
                  ? "Guest Trial Used"
                  : "Daily Limit Reached"
                : "Start Free Run"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-[#d8d1c4] px-5 py-3 text-sm text-[#111111]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
