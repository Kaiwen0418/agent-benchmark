import { notFound } from "next/navigation";
import { ArtifactList } from "@/components/run/ArtifactList";
import { LiveBrowserPanel } from "@/components/run/LiveBrowserPanel";
import { RunTimeline } from "@/components/run/RunTimeline";
import { ScoreCard } from "@/components/run/ScoreCard";
import { ToolCallList } from "@/components/run/ToolCallList";
import { AppShell } from "@/components/layout/AppShell";
import { getRunDetail } from "@/lib/api";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const detail = await getRunDetail(runId);

  if (!detail.run) {
    notFound();
  }

  return (
    <AppShell
      title={`Run ${detail.run.id}`}
      description="Core run detail page with live browser placeholder, status, score, events, and artifacts."
    >
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <LiveBrowserPanel liveViewUrl={detail.run.liveViewUrl} />
        <ScoreCard run={detail.run} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RunTimeline events={detail.events} />
        <ToolCallList events={detail.events} />
      </div>
      <div className="mt-6">
        <ArtifactList artifacts={detail.artifacts} />
      </div>
    </AppShell>
  );
}
