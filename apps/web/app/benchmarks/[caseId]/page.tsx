import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/layout/SectionCard";
import { getBenchmarkCase } from "@/lib/db";
import { createRunAction } from "./actions";

export default async function BenchmarkCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const benchmarkCase = await getBenchmarkCase(caseId);

  if (!benchmarkCase) {
    notFound();
  }

  return (
    <AppShell title={benchmarkCase.title} description={benchmarkCase.description}>
      <div className="grid gap-6 md:grid-cols-[0.8fr_1.2fr]">
        <SectionCard title="Case Metadata">
          <div className="space-y-3 text-sm text-muted">
            <div>Slug: {benchmarkCase.slug}</div>
            <div>Category: {benchmarkCase.category}</div>
            <div>Difficulty: {benchmarkCase.difficulty}</div>
            <div>Visibility: {benchmarkCase.isPublic ? "public" : "private"}</div>
          </div>
        </SectionCard>
        <SectionCard title="Create Run">
          <form action={createRunAction} className="space-y-4">
            <input type="hidden" name="caseId" value={benchmarkCase.id} />
            <p className="text-sm text-muted">
              This starts a new benchmark run and redirects to the run detail page. Current implementation uses the same flow for mock mode and future real runner mode.
            </p>
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
            >
              Start Run
            </button>
          </form>
        </SectionCard>
      </div>
    </AppShell>
  );
}
