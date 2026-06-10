import type { HostedSessionFor } from "../../runtime/types.js";

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

export function submitCheckoutOrder(
  session: ShoppingSession,
  params: {
    makeId: (prefix: string) => string;
    now: () => string;
    shippingMethod: "standard" | "express";
  },
) {
  const order: Order = {
    id: params.makeId("ord"),
    items: session.state.cart.map((item) => ({ ...item })),
    total: getCartTotal(session),
    shippingMethod: params.shippingMethod,
    submittedAt: params.now(),
  };
  session.state.orders.push(order);
  session.state.cart = [];
  return order;
}
