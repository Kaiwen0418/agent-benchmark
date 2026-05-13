import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/layout/SectionCard";
import { isMockMode } from "@/lib/db";

export default function HomePage() {
  return (
    <AppShell
      title="Web Control Plane"
      description="First-stage SaaS shell for auth, benchmark selection, run creation, run status, and replay-oriented observability."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title="Current Scope">
          <div className="space-y-3 text-sm text-muted">
            <p>User login, benchmark browsing, run creation, live run status, events, score, and artifacts.</p>
            <p>
              Execution is currently designed to support a mock runner first, then a real Playwright sandbox later.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Environment">
          <div className="space-y-3 text-sm text-muted">
            <p>{isMockMode() ? "Running in mock data mode." : "Supabase-backed mode is configured."}</p>
            <div className="flex gap-3">
              <Link href="/benchmarks" className="rounded-full border border-border px-4 py-2 text-foreground">
                Browse Benchmarks
              </Link>
              <Link href="/dashboard" className="rounded-full border border-border px-4 py-2 text-foreground">
                View Dashboard
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
