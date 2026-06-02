import type { ServerResponse } from "node:http";
import type { Order } from "./types.js";
import type { HostedSession } from "../../runtime/types.js";
import { getCartRows, getCartTotal } from "./actions.js";
import { escapeHtml, layout, money, sendHtml } from "../../templates.js";

export function renderProducts(
  session: HostedSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const cards = session.products
    .map((product) => {
      const restricted = product.restricted ? `<p class="danger">Restricted product</p>` : "";
      return `<article class="card">
        <h2>${escapeHtml(product.name)}</h2>
        <p class="muted">Category: ${escapeHtml(product.category)}</p>
        <p class="price">${money(product.price)}</p>
        ${restricted}
        <form method="post" action="/shopping/cart?session=${encodeURIComponent(session.token)}">
          <input type="hidden" name="productId" value="${escapeHtml(product.id)}" />
          <button type="submit">Add to cart</button>
        </form>
      </article>`;
    })
    .join("");

  sendHtml(
    response,
    200,
    layout({
      title: "Northstar Supplies",
      session,
      body: `<section class="grid">${cards}</section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderCart(
  session: HostedSession,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const rows = getCartRows(session);
  const tableRows = rows.length
    ? rows
        .map((row) => `<tr>
          <td>${escapeHtml(row.product?.name ?? row.item.productId)}</td>
          <td>${row.item.quantity}</td>
          <td>${money(row.lineTotal)}</td>
        </tr>`)
        .join("")
    : `<tr><td colspan="3" class="muted">Cart is empty.</td></tr>`;

  sendHtml(
    response,
    200,
    layout({
      title: "Shopping Cart",
      session,
      body: `<section class="panel">
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p class="price">Cart total: ${money(getCartTotal(session))}</p>
        <form method="post" action="/shopping/checkout?session=${encodeURIComponent(session.token)}">
          <label>
            Shipping method
            <select name="shippingMethod">
              <option value="standard">Standard</option>
              <option value="express">Express</option>
            </select>
          </label>
          <button type="submit">Submit order</button>
        </form>
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}

export function renderOrder(
  session: HostedSession,
  order: Order,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
  evaluateSession: (session: HostedSession) => { status: string; score: number; summary: string },
) {
  const score = evaluateSession(session);
  sendHtml(
    response,
    200,
    layout({
      title: "Order Confirmation",
      session,
      body: `<section class="panel">
        <h2>Order submitted</h2>
        <p>Order id: <strong>${escapeHtml(order.id)}</strong></p>
        <p>Total: <strong>${money(order.total)}</strong></p>
        <p>Shipping: <strong>${escapeHtml(order.shippingMethod)}</strong></p>
        <h2>Evaluator preview</h2>
        <pre class="score">${escapeHtml(JSON.stringify(score, null, 2))}</pre>
      </section>`,
      publicBaseUrl,
      defaultStartPathForApp,
    }),
  );
}
