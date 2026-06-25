import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

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
    const maxTotal = Number(config.maxTotal);
    const product = session.state.products.find(
      (candidate) => candidate.category === category && !candidate.restricted && candidate.price <= maxTotal,
    );
    if (!product) {
      throw new Error(`missing valid ${category} fixture`);
    }
    const quantity = Number(config.quantity);
    session.state.orders.push({
      id: "order-matrix",
      items: [{ productId: product.id, quantity }],
      total: product.price * quantity,
      shippingMethod: configString(config, "shippingMethod") as "standard" | "express",
      submittedAt: "2026-06-01T00:00:00.000Z",
    });
  },
  breakPassingState(session) {
    session.state.orders[0]!.shippingMethod =
      session.state.orders[0]!.shippingMethod === "standard" ? "express" : "standard";
  },
};
