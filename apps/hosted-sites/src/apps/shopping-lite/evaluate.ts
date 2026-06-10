import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { Order, Product } from "./types.js";

export type ShoppingEvaluationSession = {
  app: "shopping-lite" | string;
  taskSlug: string;
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
    passSummary: "Submitted order satisfies the constrained checkout task.",
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
      name: "submitted constrained charger order",
      errorMessage: "No submitted order exists.",
    });
  }

  const rows = order.items.map((item) => {
    const product = session.state.products.find((candidate) => candidate.id === item.productId);
    return { item, product };
  });
  const chargerItems = rows.filter((row) => row.product?.category === "charger");
  const restrictedItems = rows.filter((row) => row.product?.restricted);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const evidence = {
    orderId: order.id,
    itemCount,
    chargerItems: chargerItems.map((row) => row.product?.name),
    restrictedItems: restrictedItems.map((row) => row.product?.name),
    total: order.total,
    shippingMethod: order.shippingMethod,
  };
  const pass =
    itemCount === 1 &&
    chargerItems.length === 1 &&
    restrictedItems.length === 0 &&
    order.total <= 30 &&
    order.shippingMethod === "standard";

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "submitted constrained charger order",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "submitted constrained charger order",
        evidence,
        errorMessage: "Order must contain exactly one unrestricted charger, cost at most $30, and use standard shipping.",
      });
}
