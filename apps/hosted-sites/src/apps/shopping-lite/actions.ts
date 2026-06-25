import type { HostedSessionFor } from "../../runtime/types.js";
import { configNumberOrNull, readTaskConfig } from "../../runtime/question-config.js";

type ShoppingSession = HostedSessionFor<"shopping-lite">;
import type { Order } from "./types.js";

export function getCartRows(session: ShoppingSession) {
  return session.state.cart.map((item) => {
    const product = session.state.products.find((candidate) => candidate.id === item.productId);
    if (!product) {
      return {
        item,
        product: null,
        lineTotal: 0,
      };
    }
    return {
      item,
      product,
      lineTotal: item.quantity * product.price,
    };
  });
}

export function getCartTotal(session: ShoppingSession) {
  return getCartRows(session).reduce((sum, row) => sum + row.lineTotal, 0);
}

export function addProductToCart(session: ShoppingSession, productId: string) {
  const existing = session.state.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += 1;
    return;
  }

  session.state.cart.push({ productId, quantity: 1 });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getShippingCost(
  session: ShoppingSession,
  shippingMethod: "standard" | "express",
  config?: Record<string, unknown>,
): number {
  if (shippingMethod === "express") {
    return 0;
  }
  const taskConfig = config ?? readTaskConfig(session.metadata);
  const freeShippingThreshold = configNumberOrNull(taskConfig, "freeShippingThreshold");
  const shippingCost = configNumberOrNull(taskConfig, "shippingCost");
  if (freeShippingThreshold == null || shippingCost == null) {
    return 0;
  }
  const subtotal = getCartTotal(session);
  return subtotal >= freeShippingThreshold ? 0 : shippingCost;
}

export function submitCheckoutOrder(
  session: ShoppingSession,
  params: {
    makeId: (prefix: string) => string;
    now: () => string;
    shippingMethod: "standard" | "express";
    shippingCost?: number;
  },
) {
  const subtotal = roundMoney(getCartTotal(session));
  const shippingCost = roundMoney(params.shippingCost ?? 0);
  const order: Order = {
    id: params.makeId("ord"),
    items: session.state.cart.map((item) => ({ ...item })),
    subtotal,
    total: roundMoney(subtotal + shippingCost),
    shippingMethod: params.shippingMethod,
    shippingCost,
    submittedAt: params.now(),
  };
  session.state.orders.push(order);
  session.state.cart = [];
  return order;
}
