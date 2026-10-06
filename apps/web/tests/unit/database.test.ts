import assert from "node:assert/strict";
import test from "node:test";
import {
  checkWebDatabaseReadiness,
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

test("database readiness resolves after a successful ping", async () => {
  let pinged = false;
  await checkWebDatabaseReadiness({
    ping: async () => {
      pinged = true;
    },
  });
  assert.equal(pinged, true);
});

test("database readiness propagates ping failures", async () => {
  await assert.rejects(
    checkWebDatabaseReadiness({
      ping: async () => {
        throw new Error("database unavailable");
      },
    }),
    /database unavailable/,
  );
});
