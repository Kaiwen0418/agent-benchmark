import { configNumberOrNull, configString, configStringOrNull, type HostedAppTestSupport } from "../../runtime/test-support.js";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export const shoppingLiteTestSupport: HostedAppTestSupport<"shopping-lite"> = {
  exampleTaskConfig: {
    targetCategory: "charger",
    quantity: 1,
    maxTotal: 30,
    shippingMethod: "standard",
    avoidRestricted: true,
  },
  applyPassingState(session, config) {
    const category = configString(config, "targetCategory");
    const quantity = Number(config.quantity);
    const requiredDevice = configStringOrNull(config, "requiredDevice");
    const couponCode = configStringOrNull(config, "couponCode");
    const discountPercent = configNumberOrNull(config, "discountPercent");

    const product = session.state.products.find(
      (candidate) =>
        candidate.category === category &&
        !candidate.restricted &&
        (candidate.stock == null || candidate.stock >= quantity) &&
        (!requiredDevice || (candidate.compatibleWith?.includes(requiredDevice) ?? false)),
    );
    if (!product) {
      throw new Error(`missing valid ${category} fixture`);
    }
    const items = [{ productId: product.id, quantity }];
    let subtotal = product.price * quantity;

    const secondaryCategory = configStringOrNull(config, "secondaryCategory");
    if (secondaryCategory) {
      const secondaryQuantity = configNumberOrNull(config, "secondaryQuantity") ?? 1;
      const secondaryProduct = session.state.products.find(
        (candidate) =>
          candidate.category === secondaryCategory &&
          !candidate.restricted &&
          (candidate.stock == null || candidate.stock >= secondaryQuantity),
      );
      if (!secondaryProduct) {
        throw new Error(`missing valid ${secondaryCategory} fixture`);
      }
      items.push({ productId: secondaryProduct.id, quantity: secondaryQuantity });
      subtotal += secondaryProduct.price * secondaryQuantity;
    }

    const shippingMethod = configString(config, "shippingMethod") as "standard" | "express";
    const freeShippingThreshold = configNumberOrNull(config, "freeShippingThreshold");
    const shippingCostConfig = configNumberOrNull(config, "shippingCost");
    const shippingCost =
      shippingMethod === "standard" && freeShippingThreshold != null && shippingCostConfig != null
        ? subtotal >= freeShippingThreshold
          ? 0
          : shippingCostConfig
        : 0;

    const discountAmount = couponCode && discountPercent != null ? roundMoney((subtotal * discountPercent) / 100) : 0;

    session.state.orders.push({
      id: "order-matrix",
      items,
      subtotal: roundMoney(subtotal),
      total: roundMoney(subtotal - discountAmount + shippingCost),
      shippingMethod,
      shippingCost: roundMoney(shippingCost),
      ...(couponCode ? { couponCode, discountAmount } : {}),
      submittedAt: "2026-06-01T00:00:00.000Z",
    });
  },
  breakPassingState(session) {
    const order = session.state.orders[0]!;
    order.shippingMethod = order.shippingMethod === "standard" ? "express" : "standard";
  },
};
