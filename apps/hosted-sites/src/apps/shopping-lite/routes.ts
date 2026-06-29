import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { readTaskConfig } from "../../runtime/question-config.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { addProductToCart, getShippingCost, removeProductFromCart, resolveCoupon, setCartItemQuantity, submitCheckoutOrder } from "./actions.js";
import { renderCart, renderOrder, renderProducts } from "./render.js";

export function createShoppingRoutes(deps: HostedAppRouteDeps) {
  async function getShoppingSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "shopping-lite") ? session : null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (request.method === "GET" && url.pathname === "/shopping") {
      const session = await getShoppingSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderProducts(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/shopping/cart") {
      const session = await getShoppingSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const form = await deps.readForm(request);
      const productId = form.get("productId");
      if (typeof productId !== "string" || !session.state.products.some((product) => product.id === productId)) {
        deps.badRequest(response, "Invalid product");
        return true;
      }

      const added = addProductToCart(session, productId);
      if (!added.success) {
        deps.badRequest(response, added.error);
        return true;
      }
      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "cart.item_added", productId });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "cart.item_added",
        productId,
      });
      redirect(response, `/shopping/cart?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/shopping/cart/update") {
      const session = await getShoppingSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const form = await deps.readForm(request);
      const productId = form.get("productId");
      if (typeof productId !== "string" || !session.state.products.some((product) => product.id === productId)) {
        deps.badRequest(response, "Invalid product");
        return true;
      }

      const action = form.get("action");
      if (action === "remove") {
        removeProductFromCart(session, productId);
      } else {
        const quantity = Number(form.get("quantity"));
        if (!Number.isInteger(quantity) || quantity < 0) {
          deps.badRequest(response, "Invalid quantity");
          return true;
        }
        const updated = setCartItemQuantity(session, productId, quantity);
        if (!updated.success) {
          deps.badRequest(response, updated.error);
          return true;
        }
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "cart.updated", productId });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "cart.updated",
        productId,
      });
      redirect(response, `/shopping/cart?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    if (request.method === "GET" && url.pathname === "/shopping/cart") {
      const session = await getShoppingSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderCart(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/shopping/checkout") {
      const session = await getShoppingSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;
      if (session.state.cart.length === 0) {
        deps.badRequest(response, "Cart is empty");
        return true;
      }

      const form = await deps.readForm(request);
      const shippingMethod = form.get("shippingMethod") === "express" ? "express" : "standard";
      const coupon = resolveCoupon(form.get("couponCode"));
      const taskConfig = readTaskConfig(session.metadata);
      const shippingCost = getShippingCost(session, shippingMethod, taskConfig);
      const order = submitCheckoutOrder(session, {
        makeId: deps.makeId,
        now: deps.now,
        shippingMethod,
        shippingCost,
        coupon,
      });
      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "order.submitted", orderId: order.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "order.submitted",
        orderId: order.id,
      });
      const result = deps.evaluateSession(session);
      const completed = await deps.completeSession(session, result);
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }
      redirect(response, `/shopping/order/${encodeURIComponent(order.id)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const orderMatch = url.pathname.match(/^\/shopping\/order\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      const session = await getShoppingSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const order = session.state.orders.find((candidate) => candidate.id === decodeURIComponent(orderMatch[1]));
      if (!order) {
        deps.notFound(response);
        return true;
      }

      renderOrder(
        session,
        order,
        response,
        deps.publicBaseUrl,
        deps.defaultStartPathForApp,
        await deps.resolveSessionResult(session),
      );
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
