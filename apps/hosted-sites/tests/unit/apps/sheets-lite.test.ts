import assert from "node:assert/strict";
import test from "node:test";
import { recordSheetValidation, upsertSheetAnalysisRow } from "../../../src/apps/sheets-lite/actions.js";
import { sheetsLiteDefinition } from "../../../src/apps/sheets-lite/definition.js";
import { evaluateSheetsLite } from "../../../src/apps/sheets-lite/evaluate.js";
import type { HostedSessionFor } from "../../../src/runtime/types.js";

const expectedRows = [
  { orderId: "PO-101", vendorName: "Northstar Components", subtotal: 600, tax: 120, landedTotal: 745, decision: "APPROVE" as const },
  { orderId: "PO-104", vendorName: "Cedar Supply", subtotal: 720, tax: 144, landedTotal: 894, decision: "APPROVE" as const },
];

function makeSession(): HostedSessionFor<"sheets-lite"> {
  return {
    app: "sheets-lite",
    id: "session-sheets",
    token: "tok-sheets",
    runId: null,
    caseId: null,
    attemptId: null,
    callbackSecret: null,
    suiteSlug: "hosted-web-capability-suite-v1",
    suiteVersion: "1.1.0",
    taskSlug: "sheets-procurement-analysis",
    taskVersion: "1.0.0",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: "Build and validate the analysis.",
    startPath: "/sheets",
    seedVersion: "sheets-v1",
    metadata: {
      questionGeneration: {
        schemaVersion: 3,
        generationSeed: "sheets-test",
        variantId: "active-equipment-under-cap",
        taskConfig: { expectedRows },
      },
    },
    status: "active",
    expiresAt: null,
    accessCount: 0,
    lastAccessedAt: null,
    firstSeenIp: null,
    lastSeenIp: null,
    firstSeenUserAgent: null,
    lastSeenUserAgent: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    events: [],
    persisted: false,
    state: sheetsLiteDefinition.buildInitialSessionState(),
  };
}

const now = () => "2026-07-01T10:00:00.000Z";

test("sheets joins, rounds, upserts, and validates exact analysis rows", () => {
  const session = makeSession();
  for (const row of expectedRows) {
    assert.equal(upsertSheetAnalysisRow(session, { ...row, now }).success, true);
  }
  recordSheetValidation(session, { makeId: (prefix) => `${prefix}-1`, now });
  assert.equal(evaluateSheetsLite(session).status, "passed");

  const updated = upsertSheetAnalysisRow(session, { ...expectedRows[0]!, landedTotal: 744.999, now });
  assert.equal(updated.success, true);
  assert.equal(session.state.sheetAnalysisRows.length, 2);
  assert.equal(session.state.sheetAnalysisRows[0]?.landedTotal, 745);
});

test("sheets fails closed for wrong formulas, extra rows, or missing validation", () => {
  const session = makeSession();
  for (const row of expectedRows) upsertSheetAnalysisRow(session, { ...row, now });
  assert.equal(evaluateSheetsLite(session).status, "failed");

  recordSheetValidation(session, { makeId: (prefix) => `${prefix}-1`, now });
  session.state.sheetAnalysisRows[0]!.tax = 119;
  assert.equal(evaluateSheetsLite(session).status, "failed");

  session.state.sheetAnalysisRows[0]!.tax = 120;
  upsertSheetAnalysisRow(session, {
    orderId: "PO-102",
    vendorName: "Bluebird Industrial",
    subtotal: 600,
    tax: 120,
    landedTotal: 740,
    decision: "REVIEW",
    now,
  });
  recordSheetValidation(session, { makeId: (prefix) => `${prefix}-2`, now });
  assert.equal(evaluateSheetsLite(session).status, "failed");
});
