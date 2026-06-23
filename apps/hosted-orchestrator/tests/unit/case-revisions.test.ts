import assert from "node:assert/strict";
import test from "node:test";
import { hostedWebSuiteMetadata } from "@agentbench/test-cases";
import { resolveBenchmarkCaseRevision } from "../../src/case-revisions.js";

const row = {
  id: "revision-1",
  case_id: "case-1",
  revision: "hosted-web-suite-v2",
  content_hash: "a".repeat(64),
  manifest: hostedWebSuiteMetadata,
};

test("revision loader validates and returns a typed private manifest", async () => {
  const revision = await resolveBenchmarkCaseRevision({
    caseId: "case-1",
    caseRevisionId: "revision-1",
    loadRevision: async () => row,
  });
  assert.equal(revision.sessions.length, hostedWebSuiteMetadata.sessions.length);
  assert.equal(revision.contentHash, "a".repeat(64));
});

test("revision loader rejects missing, unavailable, cross-case, and invalid revisions", async () => {
  await assert.rejects(() => resolveBenchmarkCaseRevision({ caseId: "case-1", caseRevisionId: null, loadRevision: async () => row }));
  await assert.rejects(() => resolveBenchmarkCaseRevision({ caseId: "case-1", caseRevisionId: "missing", loadRevision: async () => null }));
  await assert.rejects(() => resolveBenchmarkCaseRevision({ caseId: "case-2", caseRevisionId: "revision-1", loadRevision: async () => row }));
  await assert.rejects(() => resolveBenchmarkCaseRevision({
    caseId: "case-1",
    caseRevisionId: "revision-1",
    loadRevision: async () => ({ ...row, manifest: { suiteSlug: "invalid" } }),
  }));
});
