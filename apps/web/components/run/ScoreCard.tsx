import type { BenchmarkRun } from "@agentbench/protocol";
import { SectionCard } from "@/components/layout/SectionCard";

export function ScoreCard({ run }: { run: BenchmarkRun }) {
  return (
    <SectionCard title="Run Status">
      <div className="grid gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">Status</span>
          <span className="font-medium">{run.status}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Score</span>
          <span className="font-medium">{run.score ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Started</span>
          <span className="font-medium">{run.startedAt ? new Date(run.startedAt).toLocaleString() : "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Completed</span>
          <span className="font-medium">
            {run.completedAt ? new Date(run.completedAt).toLocaleString() : "-"}
          </span>
        </div>
        {run.errorMessage ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger">
            {run.errorMessage}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
