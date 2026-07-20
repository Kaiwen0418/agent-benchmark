import type { HostedAppTestSupport } from "../../runtime/test-support.js";
import type { SheetAnalysisRow } from "./types.js";

function rows(config: Record<string, unknown>) {
  return Array.isArray(config.expectedRows) ? config.expectedRows as Array<Omit<SheetAnalysisRow, "updatedAt">> : [];
}

export const sheetsLiteTestSupport: HostedAppTestSupport<"sheets-lite"> = {
  exampleTaskConfig: {
    expectedRows: [
      { orderId: "PO-101", vendorName: "Northstar Components", subtotal: 600, tax: 120, landedTotal: 745, decision: "APPROVE" },
      { orderId: "PO-104", vendorName: "Cedar Supply", subtotal: 720, tax: 144, landedTotal: 894, decision: "APPROVE" },
    ],
  },
  applyPassingState(session, config) {
    session.state.sheetAnalysisRows = rows(config).map((row) => ({
      ...row,
      updatedAt: "2026-07-01T10:00:00.000Z",
    }));
    session.state.sheetValidationRuns.push({
      id: "sheet-validation-test",
      rowCount: session.state.sheetAnalysisRows.length,
      createdAt: "2026-07-01T10:01:00.000Z",
    });
  },
  breakPassingState(session) {
    session.state.sheetAnalysisRows[0]!.landedTotal += 1;
  },
};
