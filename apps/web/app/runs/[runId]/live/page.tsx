import { notFound } from "next/navigation";
import { LiveRunViewer } from "@/components/run/LiveRunViewer";
import { getBenchmarkCase, getBenchmarkRun, listArtifacts, listRunEvents } from "@/lib/db";

function deriveInitialFrameUrl(
  events: Awaited<ReturnType<typeof listRunEvents>>,
  artifacts: Awaited<ReturnType<typeof listArtifacts>>,
) {
  const liveEvent = [...events]
    .reverse()
    .find((event) => event.type === "live.frame" && typeof event.payload.url === "string");

  if (liveEvent && typeof liveEvent.payload.url === "string") {
    return liveEvent.payload.url;
  }

  const latestScreenshot = [...artifacts]
    .reverse()
    .find((artifact) => artifact.type === "screenshot" && typeof artifact.url === "string");

  return latestScreenshot?.url ?? null;
}

export default async function RunLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ embed?: string }>;
}) {
  const { runId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    notFound();
  }

  const [benchmarkCase, events, artifacts] = await Promise.all([
    getBenchmarkCase(run.caseId),
    listRunEvents(runId),
    listArtifacts(runId),
  ]);

  return (
    <LiveRunViewer
      runId={runId}
      initialTitle={benchmarkCase?.title ?? "AgentBench Live Run"}
      initialStatus={run.status}
      initialScore={run.score}
      initialFrameUrl={deriveInitialFrameUrl(events, artifacts)}
      embedded={resolvedSearchParams?.embed === "1"}
    />
  );
}
