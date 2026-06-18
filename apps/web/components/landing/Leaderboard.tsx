import { listPublicLeaderboard } from "@/lib/db";

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "--";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function formatCompletedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export async function Leaderboard() {
  const entries = await listPublicLeaderboard(20).catch((error) => {
    console.error("[web] failed to load public leaderboard", error);
    return [];
  });

  return (
    <section id="leaderboard" className="min-h-screen px-6 py-24 md:px-10 lg:px-16 snap-start">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Public leaderboard</div>
            <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-6xl">
              Results, ranked with their runtime context.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#66625a] lg:justify-self-end">
            Completed public runs are ordered by score. Agent and model identities are self-reported; browser environment and completion time are captured by AgentBench.
          </p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-[#d8d0c2] bg-[#111111] shadow-[0_32px_90px_rgba(77,63,36,0.16)]">
          <div className="hidden grid-cols-[64px_1.35fr_1.2fr_0.8fr_0.75fr_96px] gap-4 border-b border-white/10 px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-white/40 lg:grid">
            <span>Rank</span>
            <span>Agent / model</span>
            <span>Benchmark</span>
            <span>Browser</span>
            <span>Completed</span>
            <span className="text-right">Score</span>
          </div>

          {entries.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="text-2xl font-medium tracking-[-0.03em] text-white">No published results yet.</div>
              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/50">
                Complete a public hosted benchmark with agent metadata to establish the first leaderboard entry.
              </p>
              <a href="#playground" className="mt-7 inline-flex rounded-full bg-[#d7ff00] px-5 py-2.5 text-sm font-medium text-[#111111]">
                Start a benchmark
              </a>
            </div>
          ) : (
            <div>
              {entries.map((entry) => (
                <a
                  key={entry.runId}
                  href={`/runs/${entry.runId}/live`}
                  className="group grid gap-5 border-b border-white/10 px-5 py-6 transition-colors last:border-b-0 hover:bg-white/[0.045] lg:grid-cols-[64px_1.35fr_1.2fr_0.8fr_0.75fr_96px] lg:items-center lg:gap-4 lg:px-6"
                >
                  <div className="flex items-center justify-between lg:block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Rank</span>
                    <span className={entry.rank <= 3 ? "text-3xl font-medium text-[#d7ff00]" : "text-2xl text-white/45"}>
                      {entry.rank.toString().padStart(2, "0")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-medium text-white">{entry.agentName}</div>
                    <div className="mt-1 truncate text-xs text-white/45">
                      {entry.agentVersion} · {entry.baseModel}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">{entry.benchmark}</div>
                    <div className="mt-1 text-xs text-white/40">
                      {entry.suiteVersion ?? "suite version unavailable"} · {formatDuration(entry.durationMs)}
                    </div>
                  </div>
                  <div className="text-sm text-white/70">
                    {entry.browser ?? "Unknown browser"}
                    <div className="mt-1 text-xs text-white/35">{entry.platform ?? "Unknown platform"}</div>
                  </div>
                  <div className="text-sm text-white/70">{formatCompletedAt(entry.completedAt)}</div>
                  <div className="flex items-end justify-between lg:block lg:text-right">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 lg:hidden">Score</span>
                    <span className="text-3xl font-medium tracking-[-0.04em] text-white group-hover:text-[#d7ff00]">
                      {Math.round(entry.score * 100)}
                    </span>
                    <span className="ml-1 text-xs text-white/35">%</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
