import type { HostedSessionFor } from "../../runtime/types.js";
import { configNumberOrNull, readTaskConfig } from "../../runtime/question-config.js";

type ShoppingSession = HostedSessionFor<"shopping-lite">;
import type { Order } from "./types.js";
import { shoppingCoupons } from "./seed.js";

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

export type CartMutationResult = { success: true } | { success: false; error: string };

export function addProductToCart(session: ShoppingSession, productId: string): CartMutationResult {
  const product = session.state.products.find((candidate) => candidate.id === productId);
  if (!product) {
    return { success: false, error: "Unknown product" };
  }

  const existing = session.state.cart.find((item) => item.productId === productId);
  const nextQuantity = (existing?.quantity ?? 0) + 1;
  if (product.stock != null && nextQuantity > product.stock) {
    return { success: false, error: "Out of stock" };
  }

  if (existing) {
    existing.quantity = nextQuantity;
    return { success: true };
  }

  session.state.cart.push({ productId, quantity: 1 });
  return { success: true };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function removeProductFromCart(session: ShoppingSession, productId: string) {
  session.state.cart = session.state.cart.filter((item) => item.productId !== productId);
}

export function setCartItemQuantity(
  session: ShoppingSession,
  productId: string,
  quantity: number,
): CartMutationResult {
  if (!Number.isInteger(quantity)) {
    throw new Error("Quantity must be an integer.");
  }
  if (quantity <= 0) {
    removeProductFromCart(session, productId);
    return { success: true };
  }

  const product = session.state.products.find((candidate) => candidate.id === productId);
  if (product?.stock != null && quantity > product.stock) {
    return { success: false, error: "Out of stock" };
  }

  const existing = session.state.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity = quantity;
  } else {
    session.state.cart.push({ productId, quantity });
  }
  return { success: true };
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

export function resolveCoupon(rawCode: string | null | undefined): { code: string; discountPercent: number } | null {
  if (typeof rawCode !== "string") {
    return null;
  }
  const code = rawCode.trim().toUpperCase();
  if (code.length === 0) {
    return null;
  }
  const discountPercent = shoppingCoupons[code];
  if (discountPercent == null) {
    return null;
  }
  return { code, discountPercent };
}

export function submitCheckoutOrder(
  session: ShoppingSession,
  params: {
    makeId: (prefix: string) => string;
    now: () => string;
    shippingMethod: "standard" | "express";
    shippingCost?: number;
    coupon?: { code: string; discountPercent: number } | null;
  },
) {
  const subtotal = roundMoney(getCartTotal(session));
  const shippingCost = roundMoney(params.shippingCost ?? 0);
  const discountAmount = params.coupon
    ? roundMoney((subtotal * params.coupon.discountPercent) / 100)
    : 0;
  const order: Order = {
    id: params.makeId("ord"),
    items: session.state.cart.map((item) => ({ ...item })),
    subtotal,
    total: roundMoney(subtotal - discountAmount + shippingCost),
    shippingMethod: params.shippingMethod,
    shippingCost,
    submittedAt: params.now(),
  };
  if (params.coupon) {
    order.couponCode = params.coupon.code;
    order.discountAmount = discountAmount;
  }
  session.state.orders.push(order);
  session.state.cart = [];
  return order;
}
