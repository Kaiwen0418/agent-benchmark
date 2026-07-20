import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import { readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";
import type { SheetAnalysisRow } from "./types.js";

type ExpectedRow = Omit<SheetAnalysisRow, "updatedAt">;

function expectedRows(config: Record<string, unknown>): ExpectedRow[] {
  if (!Array.isArray(config.expectedRows)) {
    throw new Error("Generated taskConfig.expectedRows must be an array.");
  }
  return config.expectedRows.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Generated expectedRows entries must be objects.");
    }
    const row = value as Record<string, unknown>;
    if (typeof row.orderId !== "string" || typeof row.vendorName !== "string"
      || typeof row.subtotal !== "number" || typeof row.tax !== "number"
      || typeof row.landedTotal !== "number"
      || (row.decision !== "APPROVE" && row.decision !== "REVIEW")) {
      throw new Error("Generated expectedRows entry is invalid.");
    }
    return row as ExpectedRow;
  });
}

function comparable(row: ExpectedRow) {
  return [row.orderId, row.vendorName, row.subtotal, row.tax, row.landedTotal, row.decision];
}

export function evaluateSheetsLite(session: HostedSessionFor<"sheets-lite">): HostedWebScoreResult {
  const expected = expectedRows(readTaskConfig(session.metadata)).sort(
    (left, right) => left.orderId.localeCompare(right.orderId),
  );
  const actual = session.state.sheetAnalysisRows.map(({ updatedAt: _updatedAt, ...row }) => row).sort(
    (left, right) => left.orderId.localeCompare(right.orderId),
  );
  const rowsPassed = JSON.stringify(actual.map(comparable)) === JSON.stringify(expected.map(comparable));
  const validation = session.state.sheetValidationRuns.at(-1);
  const validationPassed = validation !== undefined && validation.rowCount === actual.length;

  return aggregateStrictScore({
    evaluators: [
      rowsPassed
        ? passedEvaluator({
            type: "backend_state",
            name: "joined analysis rows are exact",
            evidence: { rowCount: actual.length, orderIds: actual.map((row) => row.orderId) },
          })
        : failedEvaluator({
            type: "backend_state",
            name: "joined analysis rows are exact",
            errorMessage: "The filtered rows, join values, formulas, or decisions are incorrect.",
            evidence: { rowCount: actual.length, orderIds: actual.map((row) => row.orderId) },
          }),
      validationPassed
        ? passedEvaluator({
            type: "ui_state",
            name: "analysis validation was run",
            evidence: { validationRunId: validation.id, validatedRowCount: validation.rowCount },
          })
        : failedEvaluator({
            type: "ui_state",
            name: "analysis validation was run",
            errorMessage: "Validate the current analysis after editing all rows.",
            evidence: { validationRunId: null, validatedRowCount: null },
          }),
    ],
    passSummary: "The joined, calculated, and validated analysis is correct.",
    failSummary: "The analysis rows or explicit validation step are incomplete or incorrect.",
  });
}
