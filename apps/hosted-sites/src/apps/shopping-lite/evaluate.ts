import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { Order, Product } from "./types.js";
import { configBoolean, configNumber, configNumberOrNull, configString, configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";

export type ShoppingEvaluationSession = {
  app: "shopping-lite" | string;
  taskSlug: string;
  metadata: Record<string, unknown>;
  state: {
    products: Product[];
    orders: Order[];
  };
};

export function evaluateShopping(session: ShoppingEvaluationSession): HostedWebScoreResult {
  const submittedOrder = session.state.orders.at(-1);
  const backend = evaluateShoppingBackendState(session, submittedOrder);
  const ui = submittedOrder
    ? passedEvaluator({
        type: "ui_state",
        name: "order confirmation available",
        evidence: { orderId: submittedOrder.id, confirmationPath: `/shopping/order/${submittedOrder.id}` },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "order confirmation available",
        errorMessage: "No submitted order exists.",
      });
  const finalResponse = failedEvaluator({
    type: "final_response",
    name: "agent reports submitted order id",
    required: false,
    errorMessage: "Final agent response is not collected by hosted-sites yet.",
  });

  return aggregateStrictScore({
    evaluators: [backend, ui, finalResponse],
    passSummary: "Submitted order satisfies the generated checkout constraints.",
    failSummary: "Submitted order does not satisfy all required checkout conditions.",
  });
}

export function evaluateShoppingBackendState(
  session: ShoppingEvaluationSession,
  order: Order | undefined,
): HostedWebEvaluatorResult {
  if (!order) {
    return failedEvaluator({
      type: "backend_state",
      name: "submitted generated constrained order",
      errorMessage: "No submitted order exists.",
    });
  }

  const config = readTaskConfig(session.metadata);
  const targetCategory = configString(config, "targetCategory");
  const maxTotal = configNumber(config, "maxTotal");
  const expectedQuantity = configNumber(config, "quantity");
  const shippingMethod = configString(config, "shippingMethod");
  const avoidRestricted = configBoolean(config, "avoidRestricted");
  const secondaryCategory = configStringOrNull(config, "secondaryCategory");
  const secondaryQuantity = configNumberOrNull(config, "secondaryQuantity") ?? 1;
  const requiredDevice = configStringOrNull(config, "requiredDevice");
  const couponCode = configStringOrNull(config, "couponCode");

  const rows = order.items.map((item) => {
    const product = session.state.products.find((candidate) => candidate.id === item.productId);
    return { item, product };
  });
  const targetItems = rows.filter((row) => row.product?.category === targetCategory);
  const secondaryItems = secondaryCategory
    ? rows.filter((row) => row.product?.category === secondaryCategory)
    : [];
  const restrictedItems = rows.filter((row) => row.product?.restricted);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const targetQuantity = targetItems.reduce((sum, row) => sum + row.item.quantity, 0);
  const secondaryItemQuantity = secondaryItems.reduce((sum, row) => sum + row.item.quantity, 0);
  const expectedItemCount = expectedQuantity + (secondaryCategory ? secondaryQuantity : 0);

  // Hard variants require every target item to be certified for the generated
  // device; easy variants leave requiredDevice unset and skip the check.
  const compatibleTargets =
    !requiredDevice ||
    (targetItems.length > 0 &&
      targetItems.every((row) => row.product?.compatibleWith?.includes(requiredDevice) ?? false));

  // Stock can never be exceeded; this guards against persisted state that
  // bypassed the cart action enforcement.
  const stockRespected = order.items.every((item) => {
    const product = session.state.products.find((candidate) => candidate.id === item.productId);
    return product?.stock == null || item.quantity <= product.stock;
  });

  const couponApplied = !couponCode || order.couponCode === couponCode;

  const evidence = {
    orderId: order.id,
    itemCount,
    targetCategory,
    targetItems: targetItems.map((row) => row.product?.name),
    secondaryCategory,
    secondaryItems: secondaryItems.map((row) => row.product?.name),
    restrictedItems: restrictedItems.map((row) => row.product?.name),
    requiredDevice,
    couponCode,
    appliedCoupon: order.couponCode ?? null,
    discountAmount: order.discountAmount ?? 0,
    subtotal: order.subtotal ?? order.total,
    total: order.total,
    shippingMethod: order.shippingMethod,
  };

  const pass =
    itemCount === expectedItemCount &&
    targetQuantity === expectedQuantity &&
    (!secondaryCategory || secondaryItemQuantity === secondaryQuantity) &&
    (!avoidRestricted || restrictedItems.length === 0) &&
    compatibleTargets &&
    stockRespected &&
    couponApplied &&
    order.total <= maxTotal &&
    order.shippingMethod === shippingMethod;

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "submitted generated constrained order",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "submitted generated constrained order",
        evidence,
        errorMessage:
          "Order does not satisfy the generated category, quantity, budget, restriction, compatibility, stock, coupon, and shipping constraints.",
      });
}
