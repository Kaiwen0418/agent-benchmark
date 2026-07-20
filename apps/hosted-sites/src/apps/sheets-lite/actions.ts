import type { HostedSessionFor } from "../../runtime/types.js";
import type { SheetAnalysisRow } from "./types.js";

type SheetsSession = HostedSessionFor<"sheets-lite">;

function twoDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function upsertSheetAnalysisRow(
  session: SheetsSession,
  input: Omit<SheetAnalysisRow, "updatedAt"> & { now: () => string },
) {
  if (!session.state.sheetOrders.some((order) => order.id === input.orderId)) {
    return { success: false, error: "Order not found" } as const;
  }
  if (![input.subtotal, input.tax, input.landedTotal].every(Number.isFinite)) {
    return { success: false, error: "Calculated values must be finite numbers" } as const;
  }
  const row: SheetAnalysisRow = {
    orderId: input.orderId,
    vendorName: input.vendorName.trim(),
    subtotal: twoDecimals(input.subtotal),
    tax: twoDecimals(input.tax),
    landedTotal: twoDecimals(input.landedTotal),
    decision: input.decision,
    updatedAt: input.now(),
  };
  if (!row.vendorName) return { success: false, error: "Vendor name is required" } as const;
  const existingIndex = session.state.sheetAnalysisRows.findIndex(
    (candidate) => candidate.orderId === row.orderId,
  );
  if (existingIndex >= 0) session.state.sheetAnalysisRows[existingIndex] = row;
  else session.state.sheetAnalysisRows.push(row);
  return { success: true, row } as const;
}

export function recordSheetValidation(
  session: SheetsSession,
  input: { makeId: (prefix: string) => string; now: () => string },
) {
  const run = {
    id: input.makeId("sheet-validation"),
    rowCount: session.state.sheetAnalysisRows.length,
    createdAt: input.now(),
  };
  session.state.sheetValidationRuns.push(run);
  return run;
}
