import assert from "node:assert/strict";
import test from "node:test";
import { buildHostedAttemptInitPayload } from "../../lib/hosted-web";

test("hosted attempt initialization sends a revision reference without a private manifest", () => {
  const payload = buildHostedAttemptInitPayload({
    runId: "run-1",
    caseId: "case-1",
    caseRevisionId: "revision-1",
    callbackSecret: "secret",
  });

  assert.deepEqual(payload, {
    runId: "run-1",
    caseId: "case-1",
    caseRevisionId: "revision-1",
    callbackSecret: "secret",
  });
  assert.equal("sessions" in payload, false);
  assert.equal("suiteSlug" in payload, false);
});

test("hosted attempt initialization forwards a deterministic calibration seed", () => {
  const payload = buildHostedAttemptInitPayload({
    runId: "run-1",
    caseId: "case-1",
    caseRevisionId: "revision-105",
    callbackSecret: "secret",
    generationSeed: "calibration-01",
  });

  assert.deepEqual(payload, {
    runId: "run-1",
    caseId: "case-1",
    caseRevisionId: "revision-105",
    callbackSecret: "secret",
    generationSeed: "calibration-01",
  });
});
