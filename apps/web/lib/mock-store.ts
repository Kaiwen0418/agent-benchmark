import crypto from "node:crypto";
import type {
  Artifact,
  BenchmarkCase,
  BenchmarkRun,
  RunEvent,
  Runner,
  RunStatus,
} from "@agentbench/protocol";

const now = () => new Date().toISOString();

const seedCases: BenchmarkCase[] = [
  {
    id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001",
    slug: "checkout-basic",
    title: "Checkout Flow Basics",
    description: "Navigate a mock storefront and complete a constrained checkout flow.",
    category: "browser",
    difficulty: "easy",
    isPublic: true,
    createdAt: now(),
  },
  {
    id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002",
    slug: "inbox-triage",
    title: "Inbox Triage",
    description: "Read mock communications and take the correct sequence of actions.",
    category: "communication",
    difficulty: "medium",
    isPublic: true,
    createdAt: now(),
  },
];

const seedRunner: Runner = {
  id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f1001",
  name: "mock-runner-eu-1",
  status: "online",
  capacity: 2,
  currentLoad: 0,
  lastHeartbeat: now(),
  createdAt: now(),
};

type Store = {
  cases: BenchmarkCase[];
  runs: BenchmarkRun[];
  events: RunEvent[];
  artifacts: Artifact[];
  runners: Runner[];
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
      runners: [seedRunner],
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

  createRun(caseId: string, userId: string | null) {
    const run: BenchmarkRun = {
      id: makeId(),
      userId,
      caseId,
      runnerId: null,
      status: "queued",
      score: null,
      liveViewUrl: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now(),
    };

    getStore().runs.push(run);
    this.appendEvent(run.id, "run.created", { status: "queued" });
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

  listRunners() {
    return getStore().runners;
  },

  registerRunner(name: string, capacity: number) {
    const runner: Runner = {
      id: makeId(),
      name,
      status: "online",
      capacity,
      currentLoad: 0,
      lastHeartbeat: now(),
      createdAt: now(),
    };
    getStore().runners.push(runner);
    return runner;
  },

  heartbeatRunner(runnerId: string, currentLoad: number, status: Runner["status"]) {
    const runner = getStore().runners.find((item) => item.id === runnerId);
    if (!runner) {
      return null;
    }
    runner.currentLoad = currentLoad;
    runner.status = status;
    runner.lastHeartbeat = now();
    return runner;
  },

  assignQueuedRun(runnerId: string) {
    const runner = getStore().runners.find((item) => item.id === runnerId);
    if (!runner) {
      return null;
    }

    const run = getStore().runs.find((item) => item.status === "queued");
    if (!run) {
      return null;
    }

    run.runnerId = runnerId;
    run.status = "starting";
    run.startedAt = now();
    runner.currentLoad += 1;
    this.appendEvent(run.id, "run.assigned", { runnerId });
    this.appendEvent(run.id, "run.starting", { runnerId });
    return run;
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
};
