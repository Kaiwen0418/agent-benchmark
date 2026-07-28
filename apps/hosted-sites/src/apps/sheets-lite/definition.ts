import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateSheetsLite } from "./evaluate.js";
import { buildSheetsLiteFinalState } from "./final-state.js";
import { createSheetsLiteRoutes } from "./routes.js";
import { getSheetsLiteDefaultGoal, getSheetsLiteStartPath, sheetSeedAnalysisRows, sheetSeedOrders, sheetSeedVendors } from "./seed.js";
import type { SheetAnalysisRow, SheetOrder, SheetValidationRun, SheetVendor } from "./types.js";

function isVendor(value: unknown): value is SheetVendor {
  return isStateRecord(value) && typeof value.id === "string" && typeof value.name === "string"
    && (value.status === "active" || value.status === "review" || value.status === "suspended")
    && typeof value.region === "string";
}

function isOrder(value: unknown): value is SheetOrder {
  return isStateRecord(value) && typeof value.id === "string" && typeof value.vendorId === "string"
    && typeof value.category === "string" && typeof value.units === "number"
    && typeof value.unitPrice === "number" && typeof value.taxRate === "number"
    && typeof value.shipping === "number";
}

function isAnalysisRow(value: unknown): value is SheetAnalysisRow {
  return isStateRecord(value) && typeof value.orderId === "string" && typeof value.vendorName === "string"
    && typeof value.subtotal === "number" && typeof value.tax === "number"
    && typeof value.landedTotal === "number" && (value.decision === "APPROVE" || value.decision === "REVIEW")
    && typeof value.updatedAt === "string";
}

function isValidationRun(value: unknown): value is SheetValidationRun {
  return isStateRecord(value) && typeof value.id === "string" && typeof value.rowCount === "number"
    && (value.status === "passed" || value.status === "failed")
    && typeof value.createdAt === "string";
}

export const sheetsLiteDefinition: HostedAppDefinition<"sheets-lite"> = {
  id: "sheets-lite",
  stateKeys: ["sheetVendors", "sheetOrders", "sheetAnalysisRows", "sheetValidationRuns"],
  getDefaultStartPath: getSheetsLiteStartPath,
  getDefaultGoal: getSheetsLiteDefaultGoal,
  buildInitialSessionState: () => ({
    sheetVendors: structuredClone(sheetSeedVendors),
    sheetOrders: structuredClone(sheetSeedOrders),
    sheetAnalysisRows: structuredClone(sheetSeedAnalysisRows),
    sheetValidationRuns: [],
  }),
  hydratePersistedState: (value) => ({
    sheetVendors: readStateArray(value, "sheetVendors", isVendor),
    sheetOrders: readStateArray(value, "sheetOrders", isOrder),
    sheetAnalysisRows: readStateArray(value, "sheetAnalysisRows", isAnalysisRow),
    sheetValidationRuns: readStateArray(value, "sheetValidationRuns", isValidationRun),
  }),
  buildFinalState: buildSheetsLiteFinalState,
  evaluate: evaluateSheetsLite,
  createRoutes: (deps) => [createSheetsLiteRoutes(deps).handle],
};
