import { notFound } from "next/navigation";
import { RunConnectClient } from "@/components/run/RunConnectClient";
import { getBenchmarkCase, getBenchmarkRun } from "@/lib/db";
import { hasRegisteredRunMetadata } from "@/lib/run-metadata";

export default async function RunConnectPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    notFound();
  }

  const benchmarkCase = await getBenchmarkCase(run.caseId);
  const metadata = { ...run.metadata };
  delete metadata.identityReportedAt;
  delete metadata.identitySource;
  const metadataLocked = ["completed", "failed", "cancelled", "timeout"].includes(run.status);

  return (
    <RunConnectClient
      runId={run.id}
      benchmarkTitle={benchmarkCase?.title ?? "AgentBench Run"}
      benchmarkGoal={benchmarkCase?.description ?? "Complete the benchmark objective."}
      initialAgent={run.agent}
      initialMetadata={metadata}
      initiallyRegistered={hasRegisteredRunMetadata(run)}
      metadataLocked={metadataLocked}
    />
  );
}
