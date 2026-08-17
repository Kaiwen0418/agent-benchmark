import {
  createDatabaseClient,
  type DatabaseClient,
} from "@agentbench/database";
import {
  createModelCatalogReadRepository,
  type ModelCatalogReadRepository,
} from "@agentbench/database/model-catalog";
import {
  createBenchmarkCaseReadRepository,
  type BenchmarkCaseReadRepository,
} from "@agentbench/database/benchmark-cases";

type DatabaseGlobal = typeof globalThis & {
  agentbenchWebDatabase?: DatabaseClient;
};

const databaseGlobal = globalThis as DatabaseGlobal;

function webPoolMax() {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 20)
    : 3;
}

export class DatabaseServiceUnavailableError extends Error {
  code = "service_unavailable" as const;
  status = 503 as const;

  constructor(message = "The benchmark database is temporarily unavailable.", options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseServiceUnavailableError";
  }
}

export function getWebDatabaseClient() {
  if (databaseGlobal.agentbenchWebDatabase) {
    return databaseGlobal.agentbenchWebDatabase;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseServiceUnavailableError("The database connection is not configured.");
  }

  const client = createDatabaseClient({
    connectionString,
    applicationName: "agentbench-web",
    max: webPoolMax(),
  });
  databaseGlobal.agentbenchWebDatabase = client;
  return client;
}

export function getWebModelCatalogRepository(): ModelCatalogReadRepository {
  return createModelCatalogReadRepository(getWebDatabaseClient().db);
}

export function getWebBenchmarkCaseRepository(): BenchmarkCaseReadRepository {
  return createBenchmarkCaseReadRepository(getWebDatabaseClient().db);
}
