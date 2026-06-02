import type { HostedSession } from "../../runtime/types.js";
import type { Order } from "./types.js";

export function getCartRows(session: HostedSession) {
  return session.cart.map((item) => {
    const product = session.products.find((candidate) => candidate.id === item.productId);
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

export function getCartTotal(session: HostedSession) {
  return getCartRows(session).reduce((sum, row) => sum + row.lineTotal, 0);
}

export function addProductToCart(session: HostedSession, productId: string) {
  const existing = session.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += 1;
    return;
  }

  session.cart.push({ productId, quantity: 1 });
}

export function submitCheckoutOrder(
  session: HostedSession,
  params: {
    makeId: (prefix: string) => string;
    now: () => string;
    shippingMethod: "standard" | "express";
  },
) {
  const order: Order = {
    id: params.makeId("ord"),
    items: session.cart.map((item) => ({ ...item })),
    total: getCartTotal(session),
    shippingMethod: params.shippingMethod,
    submittedAt: params.now(),
  };
  session.orders.push(order);
  session.cart = [];
  return order;
}
