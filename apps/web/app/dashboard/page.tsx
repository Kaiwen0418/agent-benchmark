import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/layout/SectionCard";
import { getCurrentUser } from "@/lib/auth";
import { listBenchmarkRuns } from "@/lib/db";

export default async function DashboardPage() {
  const [user, runs] = await Promise.all([getCurrentUser(), listBenchmarkRuns()]);

  return (
    <AppShell
      title="Dashboard"
      description="Overview of benchmark runs and current control-plane state."
    >
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Session">
          <div className="space-y-2 text-sm text-muted">
            <p>{user ? `Signed in as ${user.email}` : "No authenticated user. Showing platform shell state."}</p>
            <p>Next step: enforce protected routes after Supabase auth wiring is complete.</p>
          </div>
        </SectionCard>
        <SectionCard title="Run Count">
          <div className="text-4xl font-semibold">{runs.length}</div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-4">
        {runs.length === 0 ? (
          <SectionCard title="Recent Runs">
            <p className="text-sm text-muted">No runs yet. Start from the benchmark catalog.</p>
          </SectionCard>
        ) : (
          runs.map((run) => (
            <SectionCard key={run.id} title={run.status}>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1 text-sm text-muted">
                  <div className="font-medium text-foreground">{run.id}</div>
                  <div>Created {new Date(run.createdAt).toLocaleString()}</div>
                </div>
                <Link href={`/runs/${run.id}`} className="rounded-full border border-border px-4 py-2 text-sm text-foreground">
                  Open Run
                </Link>
              </div>
            </SectionCard>
          ))
        )}
      </div>
    </AppShell>
  );
}
