import assert from "node:assert/strict";
import test from "node:test";
import { postgresErrorCode, resolveDatabaseUrl } from "../../src/client.js";

test("runtime connections prefer the pooled database URL", () => {
  assert.equal(resolveDatabaseUrl({
    DATABASE_URL: "postgresql://pool/runtime",
    DATABASE_DIRECT_URL: "postgresql://direct/migrations",
  }), "postgresql://pool/runtime");
});

test("maintenance connections prefer the direct database URL", () => {
  assert.equal(resolveDatabaseUrl({
    DATABASE_URL: "postgresql://pool/runtime",
    DATABASE_DIRECT_URL: "postgresql://direct/migrations",
  }, { preferDirect: true }), "postgresql://direct/migrations");
});

test("a database URL is required", () => {
  assert.throws(() => resolveDatabaseUrl({}), /DATABASE_URL or DATABASE_DIRECT_URL is required/);
});

test("PostgreSQL error codes are found through wrapped causes", () => {
  assert.equal(postgresErrorCode({ cause: { code: "23505" } }), "23505");
  assert.equal(postgresErrorCode({ cause: { cause: { code: "40001" } } }), "40001");
  assert.equal(postgresErrorCode(new Error("not a database error")), null);
});
