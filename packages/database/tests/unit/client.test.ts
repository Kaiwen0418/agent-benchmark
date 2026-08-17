import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatabaseUrl } from "../../src/client.js";

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
