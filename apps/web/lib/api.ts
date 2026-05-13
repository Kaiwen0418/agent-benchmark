import type { Artifact, BenchmarkRun, RunEvent } from "@agentbench/protocol";
import { getBenchmarkRun, listArtifacts, listRunEvents } from "./db";

export type RunDetail = {
  run: BenchmarkRun | null;
  events: RunEvent[];
  artifacts: Artifact[];
};

export async function getRunDetail(runId: string): Promise<RunDetail> {
  const [run, events, artifacts] = await Promise.all([
    getBenchmarkRun(runId),
    listRunEvents(runId),
    listArtifacts(runId),
  ]);

  return { run, events, artifacts };
}
