import type { ServerResponse } from "node:http";
import type { HostedSessionFor } from "../../runtime/types.js";
import { escapeHtml, layout, sendHtml } from "../../templates.js";

export function renderSheetsLite(
  session: HostedSessionFor<"sheets-lite">,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const vendorRows = session.state.sheetVendors.map((vendor) => `<tr>
    <td>${escapeHtml(vendor.id)}</td><td>${escapeHtml(vendor.name)}</td>
    <td>${escapeHtml(vendor.status)}</td><td>${escapeHtml(vendor.region)}</td>
  </tr>`).join("");
  const orderRows = session.state.sheetOrders.map((order) => `<tr>
    <td>${escapeHtml(order.id)}</td><td>${escapeHtml(order.vendorId)}</td><td>${escapeHtml(order.category)}</td>
    <td>${order.units}</td><td>${order.unitPrice.toFixed(2)}</td><td>${order.taxRate}</td><td>${order.shipping.toFixed(2)}</td>
  </tr>`).join("");
  const analysisRows = session.state.sheetAnalysisRows.length > 0
    ? session.state.sheetAnalysisRows.map((row) => `<tr>
        <td>${escapeHtml(row.orderId)}</td><td>${escapeHtml(row.vendorName)}</td><td>${row.subtotal.toFixed(2)}</td>
        <td>${row.tax.toFixed(2)}</td><td>${row.landedTotal.toFixed(2)}</td><td>${row.decision}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="muted">No analysis rows yet.</td></tr>`;
  const orderOptions = session.state.sheetOrders.map(
    (order) => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.id)}</option>`,
  ).join("");

  sendHtml(response, 200, layout({
    title: "SheetsLite",
    session,
    publicBaseUrl,
    defaultStartPathForApp,
    body: `<section class="panel">
      <h1>Procurement workbook</h1>
      <p class="muted">Use the source tabs to filter and join records. Monetary results are stored to two decimals.</p>
    </section>
    <section class="grid" style="margin-top:16px;">
      <article class="panel" style="overflow-x:auto;">
        <h2>Vendors</h2>
        <table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Region</th></tr></thead><tbody>${vendorRows}</tbody></table>
      </article>
      <article class="panel" style="overflow-x:auto;">
        <h2>Orders</h2>
        <table><thead><tr><th>ID</th><th>Vendor ID</th><th>Category</th><th>Units</th><th>Unit price</th><th>Tax rate</th><th>Shipping</th></tr></thead><tbody>${orderRows}</tbody></table>
      </article>
    </section>
    <section class="panel" style="margin-top:16px;overflow-x:auto;">
      <h2>Analysis</h2>
      <table><thead><tr><th>Order</th><th>Vendor</th><th>Subtotal</th><th>Tax</th><th>Landed total</th><th>Decision</th></tr></thead><tbody>${analysisRows}</tbody></table>
      <form method="post" action="/sheets/rows?session=${encodeURIComponent(session.token)}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:16px;align-items:end;">
        <label>Order<select name="orderId" style="display:block;width:100%;margin-top:6px;">${orderOptions}</select></label>
        <label>Vendor name<input name="vendorName" style="display:block;width:100%;margin-top:6px;" /></label>
        <label>Subtotal<input name="subtotal" inputmode="decimal" style="display:block;width:100%;margin-top:6px;" /></label>
        <label>Tax<input name="tax" inputmode="decimal" style="display:block;width:100%;margin-top:6px;" /></label>
        <label>Landed total<input name="landedTotal" inputmode="decimal" style="display:block;width:100%;margin-top:6px;" /></label>
        <label>Decision<select name="decision" style="display:block;width:100%;margin-top:6px;"><option>APPROVE</option><option>REVIEW</option></select></label>
        <button type="submit">Add or update row</button>
      </form>
      <form method="post" action="/sheets/validate?session=${encodeURIComponent(session.token)}" style="margin-top:14px;">
        <button type="submit">Validate analysis</button>
        <span class="muted">${session.state.sheetValidationRuns.length} validation runs</span>
      </form>
    </section>`,
  }));
}
