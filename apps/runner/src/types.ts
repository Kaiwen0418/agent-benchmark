import type {
  AppendRunEventInput,
  Artifact,
  BenchmarkRun,
  CompleteRunInput,
  Runner,
} from "@agentbench/protocol";

export type RunnerJob = Pick<
  BenchmarkRun,
  "caseId" | "status" | "liveViewUrl"
> & {
  runId: string;
};

export type RegisterRunnerResponse = {
  runner: Runner;
};

export type HeartbeatRunnerResponse = {
  runner: Runner;
};

export type JobResponse = {
  job: RunnerJob | null;
};

export type EventResponse = {
  event: {
    id: string;
    runId: string;
    type: AppendRunEventInput["type"];
    payload: Record<string, unknown>;
    createdAt: string;
  };
  run: BenchmarkRun | null;
};

export type CompleteRunResponse = {
  run: BenchmarkRun;
};

export type MockExecutionPlan = {
  score: number;
  artifacts: Omit<Artifact, "id" | "runId" | "createdAt">[];
  steps: Array<{
    delayMs: number;
    event: AppendRunEventInput;
  }>;
  completionDelayMs: number;
  completion: CompleteRunInput;
};
