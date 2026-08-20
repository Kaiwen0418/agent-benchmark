import assert from "node:assert/strict";
import test from "node:test";
import {
  DatabaseServiceUnavailableError,
  getWebDatabaseClient,
} from "../../lib/database";

test("missing PostgreSQL configuration fails closed instead of creating a local store", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    assert.throws(
      () => getWebDatabaseClient(),
      (error) => error instanceof DatabaseServiceUnavailableError && error.status === 503,
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
