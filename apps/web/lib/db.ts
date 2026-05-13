import type {
  AppendRunEventInput,
  Artifact,
  BenchmarkCase,
  BenchmarkRun,
  CompleteRunInput,
  Runner,
} from "@agentbench/protocol";
import { mockStore } from "./mock-store";

export function isMockMode() {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function listBenchmarkCases(): Promise<BenchmarkCase[]> {
  return mockStore.listCases();
}

export async function getBenchmarkCase(caseId: string): Promise<BenchmarkCase | null> {
  return mockStore.getCase(caseId);
}

export async function createBenchmarkRun(params: {
  caseId: string;
  userId: string | null;
}): Promise<BenchmarkRun> {
  return mockStore.createRun(params.caseId, params.userId);
}

export async function listBenchmarkRuns(): Promise<BenchmarkRun[]> {
  return mockStore.listRuns();
}

export async function getBenchmarkRun(runId: string): Promise<BenchmarkRun | null> {
  return mockStore.getRun(runId);
}

export async function listRunEvents(runId: string) {
  return mockStore.listEvents(runId);
}

export async function listArtifacts(runId: string): Promise<Artifact[]> {
  return mockStore.listArtifacts(runId);
}

export async function appendRunEvent(runId: string, input: AppendRunEventInput) {
  const updatedRun =
    input.type === "run.running"
      ? mockStore.setRunStatus(runId, "running")
      : input.type === "run.completed"
        ? mockStore.setRunStatus(runId, "completed")
        : input.type === "run.failed"
          ? mockStore.setRunStatus(runId, "failed")
          : null;

  const event = mockStore.appendEvent(runId, input.type, input.payload);
  return { event, run: updatedRun };
}

export async function completeBenchmarkRun(runId: string, input: CompleteRunInput) {
  const run = mockStore.getRun(runId);
  if (!run) {
    return null;
  }

  run.status = input.status;
  run.score = input.score ?? null;
  run.errorMessage = input.errorMessage ?? null;
  run.completedAt = new Date().toISOString();

  input.artifacts.forEach((artifact) => {
    mockStore.createArtifact(runId, artifact);
  });

  mockStore.appendEvent(runId, input.status === "completed" ? "run.completed" : "run.failed", {
    score: input.score ?? null,
    errorMessage: input.errorMessage ?? null,
  });

  return run;
}

export async function registerRunner(params: {
  name: string;
  capacity: number;
}): Promise<Runner> {
  return mockStore.registerRunner(params.name, params.capacity);
}

export async function heartbeatRunner(params: {
  runnerId: string;
  currentLoad: number;
  status: Runner["status"];
}) {
  return mockStore.heartbeatRunner(params.runnerId, params.currentLoad, params.status);
}

export async function listRunners() {
  return mockStore.listRunners();
}

export async function assignRunnerJob(runnerId: string) {
  return mockStore.assignQueuedRun(runnerId);
}
