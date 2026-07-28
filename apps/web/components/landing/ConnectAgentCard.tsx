"use client";

import { useEffect } from "react";
import { RunConnectionCard } from "./RunConnectionCard";
import { RunDetailTabs } from "./RunDetailTabs";
import { usePlaygroundStore } from "@/lib/playground-store";
import { SiteSelect } from "@/components/ui/SiteSelect";
import { SuiteTag } from "@/components/ui/SuiteTag";

export function ConnectAgentCard() {
  const benchmark = usePlaygroundStore((state) => state.benchmark);
  const benchmarks = usePlaygroundStore((state) => state.benchmarks);
  const calibrationEnabled = usePlaygroundStore((state) => state.calibrationEnabled);
  const calibrationRevisions = usePlaygroundStore((state) => state.calibrationRevisions);
  const calibrationRevisionId = usePlaygroundStore((state) => state.calibrationRevisionId);
  const calibrationSeed = usePlaygroundStore((state) => state.calibrationSeed);
  const currentRunId = usePlaygroundStore((state) => state.currentRunId);
  const phase = usePlaygroundStore((state) => state.phase);
  const quota = usePlaygroundStore((state) => state.quota);
  const quotaLoading = usePlaygroundStore((state) => state.quotaLoading);
  const runError = usePlaygroundStore((state) => state.runError);
  const score = usePlaygroundStore((state) => state.score);
  const setBenchmark = usePlaygroundStore((state) => state.setBenchmark);
  const setCalibrationRevisionId = usePlaygroundStore((state) => state.setCalibrationRevisionId);
  const setCalibrationSeed = usePlaygroundStore((state) => state.setCalibrationSeed);
  const fetchQuota = usePlaygroundStore((state) => state.fetchQuota);
  const fetchBenchmarks = usePlaygroundStore((state) => state.fetchBenchmarks);
  const resumeRun = usePlaygroundStore((state) => state.resumeRun);
  const startRun = usePlaygroundStore((state) => state.startRun);
  const stopRun = usePlaygroundStore((state) => state.stopRun);
  const reset = usePlaygroundStore((state) => state.reset);

  const isRunning = phase === "booting" || phase === "running";
  const isDone = phase === "completed" || phase === "failed";
  const isQuotaBlocked = Boolean(quota && quota.remaining <= 0);
  const selectedBenchmark = benchmarks.find((item) => item.id === benchmark);
  const selectedRevision = calibrationRevisions.find((revision) => (
    revision.caseId === benchmark
    && revision.revisionId === calibrationRevisionId
  ));
  const selectedCaseRevisions = calibrationRevisions.filter((revision) => (
    revision.caseId === benchmark
  ));
  const isCalibrationBlocked = Boolean(
    calibrationEnabled
    && selectedRevision
    && !selectedRevision.current
    && !calibrationSeed.trim(),
  );

  useEffect(() => {
    void fetchQuota();
    void fetchBenchmarks();

    if (typeof window === "undefined") {
      return;
    }

    const latestRunId = window.localStorage.getItem("agentbench:latestRunId");
    if (latestRunId && phase === "idle" && !currentRunId) {
      void resumeRun(latestRunId);
    }
  }, [fetchQuota, fetchBenchmarks, resumeRun, phase, currentRunId]);

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
                  <SuiteTag tag={item.tag} />
                  <span className="truncate">{item.label}</span>
                </span>
              ),
            }))}
            compact
          />
        </label>

        <div className="rounded-[1.15rem] bg-[#efede6] p-3.5 text-[13px] leading-6 text-[#5c574d]">
          <div className="mb-1.5 flex items-center gap-2">
            {selectedBenchmark ? <SuiteTag tag={selectedBenchmark.tag} /> : null}
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#777064]">
              {selectedBenchmark?.version ?? ""}
            </span>
          </div>
          {selectedBenchmark?.description ?? "Loading available benchmark suites…"}
        </div>

        {calibrationEnabled && selectedCaseRevisions.length > 0 ? (
          <div className="rounded-[1.15rem] border border-[#c9c1b3] bg-white p-3.5">
            <div className="mb-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#70695e]">
                Development calibration
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[#777064]">
                Choose an immutable revision and enter a repeatable seed. Calibration results remain public and ranked.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#5d574d]">Suite revision</span>
                <SiteSelect
                  value={calibrationRevisionId}
                  onValueChange={setCalibrationRevisionId}
                  ariaLabel="Suite revision"
                  options={selectedCaseRevisions.map((revision) => ({
                    value: revision.revisionId,
                    label: `${revision.version}${revision.current ? " · current" : ""}`,
                  }))}
                  compact
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[#5d574d]">Generation seed</span>
                <input
                  type="text"
                  value={calibrationSeed}
                  onChange={(event) => setCalibrationSeed(event.target.value)}
                  maxLength={120}
                  pattern="[A-Za-z0-9][A-Za-z0-9._:-]*"
                  placeholder="e.g. calibration-01"
                  aria-label="Generation seed"
                  className="w-full rounded-[0.6rem] border border-[#d8d1c4] bg-white px-3.5 py-2.5 text-sm text-[#111111] outline-none transition placeholder:text-[#9a9388] focus:border-[#111111]"
                />
              </label>
            </div>

            <p className="mt-2 text-[11px] leading-5 text-[#8a4334]">
              {isCalibrationBlocked
                ? "A historical revision requires a seed."
                : "Leave the seed blank to start a normal run on the current revision."}
            </p>
          </div>
        ) : null}

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
          disabled={quotaLoading || isQuotaBlocked || !benchmark || isCalibrationBlocked}
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
