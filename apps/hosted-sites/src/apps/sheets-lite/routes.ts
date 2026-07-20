import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { recordSheetValidation, upsertSheetAnalysisRow } from "./actions.js";
import { renderSheetsLite } from "./render.js";

export function createSheetsLiteRoutes(deps: HostedAppRouteDeps) {
  async function getSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "sheets-lite") ? session : null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (url.pathname !== "/sheets" && url.pathname !== "/sheets/rows" && url.pathname !== "/sheets/validate") {
      return false;
    }
    const session = await getSession(url, request);
    if (!session) {
      deps.badRequest(response, "Missing or invalid session");
      return true;
    }
    if (request.method === "GET" && url.pathname === "/sheets") {
      renderSheetsLite(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/sheets/rows") {
      if (deps.rejectTerminalMutation(session, response)) return true;
      const form = await deps.readForm(request);
      const orderId = form.get("orderId");
      const vendorName = form.get("vendorName");
      const decision = form.get("decision");
      const subtotalValue = form.get("subtotal");
      const taxValue = form.get("tax");
      const landedTotalValue = form.get("landedTotal");
      if (typeof orderId !== "string" || typeof vendorName !== "string"
        || (decision !== "APPROVE" && decision !== "REVIEW")
        || typeof subtotalValue !== "string" || subtotalValue.trim() === ""
        || typeof taxValue !== "string" || taxValue.trim() === ""
        || typeof landedTotalValue !== "string" || landedTotalValue.trim() === "") {
        deps.badRequest(response, "A valid order, vendor, formulas, and decision are required");
        return true;
      }
      const result = upsertSheetAnalysisRow(session, {
        orderId,
        vendorName,
        decision,
        subtotal: Number(subtotalValue),
        tax: Number(taxValue),
        landedTotal: Number(landedTotalValue),
        now: deps.now,
      });
      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }
      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, {
        type: "task.signal",
        name: "sheets.analysis_row_saved",
        orderId: result.row.orderId,
      });
      redirect(response, `/sheets?session=${encodeURIComponent(session.token)}`);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/sheets/validate") {
      if (deps.rejectTerminalMutation(session, response)) return true;
      recordSheetValidation(session, { makeId: deps.makeId, now: deps.now });
      await deps.persistSessionSnapshot(session);
      const completed = await deps.completeSession(session, deps.evaluateSession(session));
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }
      redirect(response, `/sheets?session=${encodeURIComponent(session.token)}`);
      return true;
    }
    return false;
  }
  return { handle };
}
