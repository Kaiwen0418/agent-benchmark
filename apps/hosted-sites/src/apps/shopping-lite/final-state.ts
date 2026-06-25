import type { HostedSessionFor } from "../../runtime/types.js";

export function buildShoppingFinalState(session: HostedSessionFor<"shopping-lite">) {
  const order = session.state.orders.at(-1);
  return {
    app: "shopping-lite",
    taskSlug: session.taskSlug,
    order: order
      ? {
          id: order.id,
          total: order.total,
          subtotal: order.subtotal ?? order.total,
          shippingMethod: order.shippingMethod,
          shippingCost: order.shippingCost ?? 0,
          submittedAt: order.submittedAt,
          items: order.items.map((item) => {
            const product = session.state.products.find((candidate) => candidate.id === item.productId);
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
