"use client";

import { useEffect } from "react";
import { RunConnectionCard } from "./RunConnectionCard";
import { RunDetailTabs } from "./RunDetailTabs";
import { usePlaygroundStore } from "@/lib/playground-store";
import { SiteSelect } from "@/components/ui/SiteSelect";

function BenchmarkTag({ tag }: { tag: string }) {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = tag.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ backgroundColor: `hsla(${hue}, 75%, 55%, 0.15)`, color: `hsl(${hue}, 75%, 55%)` }}
    >
      {tag}
    </span>
  );
}

export function ConnectAgentCard() {
  const benchmark = usePlaygroundStore((state) => state.benchmark);
  const benchmarks = usePlaygroundStore((state) => state.benchmarks);
  const phase = usePlaygroundStore((state) => state.phase);
  const quota = usePlaygroundStore((state) => state.quota);
  const quotaLoading = usePlaygroundStore((state) => state.quotaLoading);
  const runError = usePlaygroundStore((state) => state.runError);
  const score = usePlaygroundStore((state) => state.score);
  const setBenchmark = usePlaygroundStore((state) => state.setBenchmark);
  const fetchQuota = usePlaygroundStore((state) => state.fetchQuota);
  const fetchBenchmarks = usePlaygroundStore((state) => state.fetchBenchmarks);
  const startRun = usePlaygroundStore((state) => state.startRun);
  const stopRun = usePlaygroundStore((state) => state.stopRun);
  const reset = usePlaygroundStore((state) => state.reset);

  const isRunning = phase === "booting" || phase === "running";
  const isDone = phase === "completed" || phase === "failed";
  const isQuotaBlocked = Boolean(quota && quota.remaining <= 0);
  const selectedBenchmark = benchmarks.find((item) => item.id === benchmark);

  useEffect(() => {
    void fetchQuota();
    void fetchBenchmarks();
  }, [fetchQuota, fetchBenchmarks]);

  const quotaBadge = quotaLoading
    ? "Loading quota"
    : quota
      ? quota.mode === "guest"
        ? `${Math.max(quota.remaining, 0)} guest run left`
        : `${Math.max(quota.remaining, 0)} of ${quota.limit} runs left`
      : "Quota unavailable";

  /* ── RUNNING phase ── */
  if (isRunning) {
    return (
      <div className="rounded-[1.6rem] border border-[#d7d0c4] bg-[#f9f7f1] p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Connect Agent</div>
            <h3 className="mt-1.5 text-[1.2rem] font-medium text-[#111111]">
              {selectedBenchmark?.label ?? "Running"}
            </h3>
          </div>
          <div className="rounded-full bg-[#d7ff00] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#111111]">
            {quotaBadge}
          </div>
        </div>

        <button
          type="button"
          onClick={stopRun}
          className="w-full rounded-full bg-[#ff8f6b] px-5 py-3 text-sm font-medium text-[#111111] transition hover:bg-[#ff6b3d]"
        >
          Stop Run
        </button>

        <RunConnectionCard />
      </div>
    );
  }

  /* ── DONE phase ── */
  if (isDone) {
    return (
      <div className="rounded-[1.6rem] border border-[#d7d0c4] bg-[#f9f7f1] p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Connect Agent</div>
            <h3 className="mt-1.5 text-[1.2rem] font-medium text-[#111111]">
              {selectedBenchmark?.label ?? "Run complete"}
            </h3>
          </div>
          <div className="rounded-full bg-[#d7ff00] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#111111]">
            {quotaBadge}
          </div>
        </div>

        <button
          type="button"
          onClick={reset}
          className="w-full rounded-full bg-[#111111] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111]"
        >
          Start Again
        </button>

        {runError ? (
          <div className="mt-3 rounded-[1rem] border border-[#ead2ca] bg-[#fff0eb] p-3 text-[13px] leading-6 text-[#8a4334]">
            {runError}
          </div>
        ) : null}

        <div className="mt-4 rounded-[1.6rem] border border-[#d7d0c4] bg-white p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
          <div className="text-xs uppercase tracking-[0.2em] text-[#70695e]">Run Complete</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[1rem] bg-[#d7ff00] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#4b5520]">Score</div>
              <div className="mt-1.5 text-2xl font-medium text-[#111111]">
                {score === null ? "--" : `${Math.round(score * 100)}%`}
              </div>
            </div>
            <div className="rounded-[1rem] bg-[#efede6] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#6a655c]">Safety</div>
              <div className="mt-1.5 text-sm text-[#111111]">
                {phase === "completed" ? "Respected" : "N/A"}
              </div>
            </div>
            <div className="rounded-[1rem] bg-[#111111] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">Steps</div>
              <div className="mt-1.5 text-sm text-white">
                {score ? `${Math.max(1, Math.round(score / 10))}` : "--"}
              </div>
            </div>
          </div>

          <RunDetailTabs />
        </div>
      </div>
    );
  }

  /* ── IDLE phase ── */
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
          <span className="mb-2 block text-[13px] text-[#5d574d]">Benchmark</span>
          <SiteSelect
            value={benchmark}
            onValueChange={(value) => setBenchmark(value)}
            ariaLabel="Benchmark"
            options={benchmarks.map((item) => ({
              value: item.id,
              label: (
                <span className="flex items-center gap-2">
                  <BenchmarkTag tag={item.tag} />
                  <span className="truncate">
                    {item.version} · {item.label}
                  </span>
                </span>
              ),
            }))}
            compact
          />
        </label>

        <div className="rounded-[1.15rem] bg-[#efede6] p-3.5 text-[13px] leading-6 text-[#5c574d]">
          <div className="mb-1.5 flex items-center gap-2">
            {selectedBenchmark ? <BenchmarkTag tag={selectedBenchmark.tag} /> : null}
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#777064]">
              {selectedBenchmark?.version ?? ""}
            </span>
          </div>
          {selectedBenchmark?.description ?? "Loading available benchmark suites…"}
        </div>

        <p className="text-[12px] leading-5 text-[#777064]">
          Agent identity, model, and optional metadata are registered on the connection page after the run is created.
        </p>

        {runError ? (
          <div className="rounded-[1rem] border border-[#ead2ca] bg-[#fff0eb] p-3 text-[13px] leading-6 text-[#8a4334]">
            {runError}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void startRun("external-agent")}
          disabled={quotaLoading || isQuotaBlocked || !benchmark}
          className="w-full rounded-full bg-[#111111] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isQuotaBlocked
            ? quota?.mode === "guest"
              ? "Guest Trial Used"
              : "Daily Limit Reached"
            : "Start Agent Session"}
        </button>
      </div>
    </div>
  );
}
