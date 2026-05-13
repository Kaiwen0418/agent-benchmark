import Link from "next/link";
import type { BenchmarkCase } from "@agentbench/protocol";
import { SectionCard } from "@/components/layout/SectionCard";

export function BenchmarkCaseList({ cases }: { cases: BenchmarkCase[] }) {
  return (
    <div className="grid gap-4">
      {cases.map((item) => (
        <SectionCard key={item.id} title={item.category}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-xl font-medium">{item.title}</h2>
              <p className="text-sm text-muted">{item.description}</p>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                {item.difficulty}
              </div>
            </div>
            <Link
              href={`/benchmarks/${item.id}`}
              className="rounded-full border border-border px-4 py-2 text-sm"
            >
              View Case
            </Link>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
