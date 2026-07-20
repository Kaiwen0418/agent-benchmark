import type { HostedSessionFor } from "../../runtime/types.js";

export function buildSheetsLiteFinalState(session: HostedSessionFor<"sheets-lite">) {
  return {
    app: "sheets-lite",
    taskSlug: session.taskSlug,
    analysisRows: session.state.sheetAnalysisRows.map(({ updatedAt: _updatedAt, ...row }) => row),
    validationRunCount: session.state.sheetValidationRuns.length,
    latestValidationStatus: session.state.sheetValidationRuns.at(-1)?.status ?? null,
  };
}
