"use client";

import { useEffect } from "react";
import { benchmarkOptions } from "./data";
import { RunConnectionCard } from "./RunConnectionCard";
import { usePlaygroundStore } from "@/lib/playground-store";

export function ConnectAgentCard() {
  const benchmark = usePlaygroundStore((state) => state.benchmark);
  const phase = usePlaygroundStore((state) => state.phase);
  const quota = usePlaygroundStore((state) => state.quota);
  const quotaLoading = usePlaygroundStore((state) => state.quotaLoading);
  const runError = usePlaygroundStore((state) => state.runError);
  const score = usePlaygroundStore((state) => state.score);
  const timeline = usePlaygroundStore((state) => state.timeline);
  const liveViewUrl = usePlaygroundStore((state) => state.liveViewUrl);
  const setBenchmark = usePlaygroundStore((state) => state.setBenchmark);
  const fetchQuota = usePlaygroundStore((state) => state.fetchQuota);
  const startRun = usePlaygroundStore((state) => state.startRun);
  const stopRun = usePlaygroundStore((state) => state.stopRun);
  const reset = usePlaygroundStore((state) => state.reset);

  const isRunning = phase === "booting" || phase === "running";
  const isDone = phase === "completed" || phase === "failed";
  const isQuotaBlocked = Boolean(quota && quota.remaining <= 0);

  useEffect(() => {
    void fetchQuota();
  }, [fetchQuota]);

  useEffect(() => {
    if (!quota?.resetAt) return;

    const resetTime = Date.parse(quota.resetAt);
    if (!Number.isFinite(resetTime)) return;

    const timeout = window.setTimeout(() => {
      void fetchQuota();
    }, Math.max(1_000, resetTime - Date.now() + 250));

    return () => window.clearTimeout(timeout);
  }, [fetchQuota, quota?.resetAt]);

  const quotaBadge = quotaLoading
    ? "Loading quota"
    : quota
      ? quota.mode === "guest"
        ? `${Math.max(quota.remaining, 0)} free run left today`
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
              {benchmarkOptions.find((b) => b.value === benchmark)?.label ?? "Running"}
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

        {liveViewUrl ? (
          <a
            href={liveViewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center rounded-full border border-[#d8d1c4] bg-white px-5 py-3 text-sm text-[#111111]"
          >
            Open Live View
          </a>
        ) : null}

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
              {benchmarkOptions.find((b) => b.value === benchmark)?.label ?? "Run complete"}
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

        {liveViewUrl ? (
          <a
            href={liveViewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center rounded-full border border-[#d8d1c4] bg-white px-5 py-3 text-sm text-[#111111]"
          >
            Open Live View
          </a>
        ) : null}

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
              <div className="mt-1.5 text-2xl font-medium text-[#111111]">{score ?? "--"}</div>
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

          {timeline.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#8f8a80]">Recent events</div>
              <div className="scroll-panel max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-[0.75rem] bg-[#f6f3ed] px-3 py-2"
                  >
                    <span className="truncate text-[13px] text-[#111111]">{entry.label}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                        entry.status === "success"
                          ? "bg-[#d7ff00] text-[#111111]"
                          : entry.status === "warning"
                            ? "bg-[#ffd24f] text-[#111111]"
                            : entry.status === "error"
                              ? "bg-[#ff8f6b] text-[#111111]"
                              : "bg-[#efede6] text-[#5c574d]"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f8a80]">Tips</div>
              {[
                "Use Agent Link to hand the run context to an agent without exposing raw JSON by default.",
                "Hosted-web runs use a session-scoped benchmark site and server-side scoring.",
                "Each benchmark has a specific goal. The agent is scored on task completion and safety.",
              ].map((tip) => (
                <div key={tip} className="flex gap-2.5 rounded-[0.85rem] bg-[#f6f3ed] px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 text-[#a09890]">→</span>
                  <span className="text-[13px] leading-5 text-[#5c574d]">{tip}</span>
                </div>
              ))}
            </div>
          )}
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

        <button
          type="button"
          onClick={() => void startRun("external-agent")}
          disabled={quotaLoading || isQuotaBlocked}
          className="w-full rounded-full bg-[#111111] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isQuotaBlocked
            ? quota?.mode === "guest"
              ? "Today's Free Run Used"
              : "Daily Limit Reached"
            : "Start Agent Session"}
        </button>
      </div>
    </div>
  );
}
