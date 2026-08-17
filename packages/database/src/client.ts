import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

export type AgentBenchDatabase = NodePgDatabase<typeof schema>;

export type DatabaseClient = {
  db: AgentBenchDatabase;
  close: () => Promise<void>;
};

export type DatabaseEnvironment = Record<string, string | undefined>;

export function resolveDatabaseUrl(
  environment: DatabaseEnvironment = process.env,
  options: { preferDirect?: boolean } = {},
) {
  const candidates = options.preferDirect
    ? [environment.DATABASE_DIRECT_URL, environment.DATABASE_URL]
    : [environment.DATABASE_URL, environment.DATABASE_DIRECT_URL];
  const url = candidates.find((candidate) => candidate && candidate.trim().length > 0);

  if (!url) {
    throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required.");
  }

  return url;
}

export function createDatabaseClient(options: {
  connectionString: string;
  applicationName: string;
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}): DatabaseClient {
  const pool = new Pool({
    connectionString: options.connectionString,
    application_name: options.applicationName,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
  });

  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
