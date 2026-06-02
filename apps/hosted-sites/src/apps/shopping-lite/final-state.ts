import type { HostedSession } from "../../runtime/types.js";

export function buildShoppingFinalState(session: HostedSession) {
  const order = session.orders.at(-1);
  return {
    app: "shopping-lite",
    taskSlug: session.taskSlug,
    order: order
      ? {
          id: order.id,
          total: order.total,
          shippingMethod: order.shippingMethod,
          submittedAt: order.submittedAt,
          items: order.items.map((item) => {
            const product = session.products.find((candidate) => candidate.id === item.productId);
            return {
              productId: item.productId,
              name: product?.name ?? item.productId,
              category: product?.category ?? null,
              price: product?.price ?? null,
              restricted: Boolean(product?.restricted),
              quantity: item.quantity,
            };
          }),
        }
      : null,
  };
}
