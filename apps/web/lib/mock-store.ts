import crypto from "node:crypto";
import type {
  Artifact,
  BenchmarkCase,
  BenchmarkRun,
  CreateRunInput,
  RunEvent,
  RunStatus,
} from "@agentbench/protocol";
import { hostedWebSuiteCase, hostedWebSuiteMetadata } from "@agentbench/test-cases";

const now = () => new Date().toISOString();

const seedCases: BenchmarkCase[] = [{
  ...hostedWebSuiteCase,
  metadata: hostedWebSuiteMetadata,
  currentRevisionId: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0105",
  createdAt: now(),
}];

type Store = {
  cases: BenchmarkCase[];
  runs: BenchmarkRun[];
  events: RunEvent[];
  artifacts: Artifact[];
};

declare global {
  var __agentbenchMockStore: Store | undefined;
}

function getStore(): Store {
  if (!global.__agentbenchMockStore) {
    global.__agentbenchMockStore = {
      cases: seedCases,
      runs: [],
      events: [],
      artifacts: [],
    };
  }

  return global.__agentbenchMockStore;
}

function makeId() {
  return crypto.randomUUID();
}

export const mockStore = {
  listCases() {
    return getStore().cases;
  },

  getCase(caseId: string) {
    return getStore().cases.find((item) => item.id === caseId || item.slug === caseId) ?? null;
  },

  listRuns() {
    return [...getStore().runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getRun(runId: string) {
    return getStore().runs.find((item) => item.id === runId) ?? null;
  },

  createRun(
    caseId: string,
    userId: string | null,
    guestId: string | null,
    executionMode: CreateRunInput["executionMode"] = "external-agent",
  ) {
    const run: BenchmarkRun = {
      id: makeId(),
      userId,
      guestId,
      caseId,
      runnerId: null,
      executionMode,
      status: executionMode === "external-agent" ? "waiting_for_agent" : "queued",
      score: null,
      liveViewUrl: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now(),
      metadata: {},
      agent: null,
      browserEnvironment: null,
      isPublic: true,
    };

    getStore().runs.push(run);
    this.appendEvent(run.id, "run.created", { status: run.status, executionMode: run.executionMode });
    return run;
  },

  updateRun(runId: string, patch: Partial<BenchmarkRun>) {
    const run = this.getRun(runId);
    if (!run) {
      return null;
    }

    Object.assign(run, patch);
    return run;
  },

  appendEvent(runId: string, type: RunEvent["type"], payload: Record<string, unknown>) {
    const event: RunEvent = {
      id: makeId(),
      runId,
      type,
      payload,
      createdAt: now(),
    };
    getStore().events.push(event);
    return event;
  },

  listEvents(runId: string) {
    return [...getStore().events]
      .filter((item) => item.runId === runId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  countRunsForUserSince(userId: string, sinceIso: string) {
    return getStore().runs.filter((item) => item.userId === userId && item.createdAt >= sinceIso).length;
  },

  countRunsForGuest(guestId: string) {
    return getStore().runs.filter((item) => item.guestId === guestId).length;
  },

  createArtifact(runId: string, artifact: Omit<Artifact, "id" | "createdAt" | "runId">) {
    const record: Artifact = {
      id: makeId(),
      runId,
      createdAt: now(),
      ...artifact,
    };
    getStore().artifacts.push(record);
    return record;
  },

  listArtifacts(runId: string) {
    return getStore().artifacts.filter((item) => item.runId === runId);
  },
  setRunStatus(runId: string, status: RunStatus) {
    const run = this.getRun(runId);
    if (!run) {
      return null;
    }

    run.status = status;
    if (status === "completed" || status === "failed" || status === "cancelled" || status === "timeout") {
      run.completedAt = now();
    }
    return run;
  },

  setRunLiveViewUrl(runId: string, liveViewUrl: string | null) {
    const run = this.getRun(runId);
    if (!run) {
      return null;
    }

    run.liveViewUrl = liveViewUrl;
    return run;
  },
};
