import { notFound } from "next/navigation";
import { getPublicBenchmarkResult } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return "Not recorded";
  const totalSeconds = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

export default async function PublicResultPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const result = await getPublicBenchmarkResult(runId);
  if (!result) notFound();

  const { run, benchmark, suite, tasks } = result;
  return (
    <main className="min-h-screen bg-[#111111] px-6 py-12 text-[#f7f2e7] md:px-10 md:py-20">
      <div className="mx-auto max-w-5xl">
        <a href="/#leaderboard" className="text-xs uppercase tracking-[0.2em] text-[#d7ff00]">Back to leaderboard</a>
        <div className="mt-8 grid gap-8 border-b border-white/10 pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/40">Public benchmark result</div>
            {run.status === "failed" ? (
              <div className="mt-3 inline-flex rounded-full bg-[#ff8d7a]/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#ff9f90]">
                Failed run · partial score
              </div>
            ) : null}
            <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-white md:text-6xl">{benchmark.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/55">{benchmark.description}</p>
          </div>
          <div className="text-left lg:text-right">
            <div className="text-7xl font-medium tracking-[-0.07em] text-[#d7ff00]">{Math.round((run.score ?? 0) * 100)}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/40">
              {run.status === "failed" ? "Partial aggregate score" : "Aggregate score"}
            </div>
          </div>
        </div>

        <section className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Agent", run.agent ? `${run.agent.name} ${run.agent.version}` : "Unreported"],
            ["Base model", run.agent?.baseModel ?? "Unreported"],
            ["Environment", [run.browserEnvironment?.browser, run.browserEnvironment?.platform].filter(Boolean).join(" · ") || "Unknown"],
            ["Duration", formatDuration(run.startedAt, run.completedAt)],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#171715] p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
              <div className="mt-2 text-sm text-white/85">{value}</div>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">Task breakdown</div>
              <h2 className="mt-2 text-2xl font-medium text-white">{suite ? `${suite.slug} · ${suite.version}` : "Hosted suite"}</h2>
            </div>
            <div className="text-sm text-white/45">Completed {run.completedAt ? new Date(run.completedAt).toLocaleString("en-GB", { timeZone: "UTC" }) : "--"} UTC</div>
          </div>
          <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {tasks.map((task, index) => (
              <article key={`${task.app}:${task.taskSlug}`} className="grid gap-3 py-6 md:grid-cols-[48px_1fr_auto] md:items-center">
                <div className="text-xl text-white/30">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <div className="text-lg font-medium text-white">{task.app}</div>
                  <div className="mt-1 text-sm text-white/45">{task.summary}</div>
                </div>
                <div className={task.status === "passed" ? "text-2xl text-[#d7ff00]" : "text-2xl text-[#ff8d7a]"}>
                  {Math.round(task.score * 100)}%
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
