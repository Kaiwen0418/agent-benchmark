import type {
  AppendRunEventInput,
  Artifact,
  BenchmarkRun,
  CompleteRunInput,
  Runner,
} from "@agentbench/protocol";

export type RunnerJob = Pick<
  BenchmarkRun,
  "caseId" | "status" | "liveViewUrl" | "executionMode"
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

export type ExecutionResult = {
  completion: CompleteRunInput;
  emittedEvents: AppendRunEventInput[];
  artifacts: Omit<Artifact, "id" | "runId" | "createdAt">[];
};
