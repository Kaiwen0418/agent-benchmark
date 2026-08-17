import {
  createDatabaseClient,
  type DatabaseClient,
} from "@agentbench/database";
import {
  createBenchmarkCaseReadRepository,
  type BenchmarkCaseReadRepository,
} from "@agentbench/database/benchmark-cases";

type OrchestratorDatabaseGlobal = typeof globalThis & {
  agentbenchOrchestratorDatabase?: DatabaseClient;
};

const databaseGlobal = globalThis as OrchestratorDatabaseGlobal;

function orchestratorPoolMax() {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 30)
    : 10;
}

export function getOrchestratorDatabaseClient(): DatabaseClient | null {
  if (databaseGlobal.agentbenchOrchestratorDatabase) {
    return databaseGlobal.agentbenchOrchestratorDatabase;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  const client = createDatabaseClient({
    connectionString,
    applicationName: `agentbench-hosted-orchestrator-${process.env.ORCHESTRATOR_MODE ?? "all"}`,
    max: orchestratorPoolMax(),
  });
  databaseGlobal.agentbenchOrchestratorDatabase = client;
  return client;
}

export function getOrchestratorBenchmarkCaseRepository(): BenchmarkCaseReadRepository | null {
  const client = getOrchestratorDatabaseClient();
  return client ? createBenchmarkCaseReadRepository(client.db) : null;
}
