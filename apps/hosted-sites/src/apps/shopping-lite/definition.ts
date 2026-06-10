import { createShoppingRoutes } from "../../routes/shopping.js";
import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateShopping } from "./evaluate.js";
import { buildShoppingFinalState } from "./final-state.js";
import { getShoppingDefaultGoal, getShoppingStartPath, shoppingSeedProducts } from "./seed.js";
import type { CartItem, Order, Product } from "./types.js";

function isProduct(value: unknown): value is Product {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.price === "number"
  );
}

function isCartItem(value: unknown): value is CartItem {
  return isStateRecord(value) && typeof value.productId === "string" && typeof value.quantity === "number";
}

function isOrder(value: unknown): value is Order {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.items) &&
    value.items.every(isCartItem) &&
    typeof value.total === "number" &&
    (value.shippingMethod === "standard" || value.shippingMethod === "express") &&
    typeof value.submittedAt === "string"
  );
}

export const shoppingLiteDefinition: HostedAppDefinition<"shopping-lite"> = {
  id: "shopping-lite",
  stateKeys: ["products", "cart", "orders"],
  getDefaultStartPath: getShoppingStartPath,
  getDefaultGoal: () => getShoppingDefaultGoal(),
  buildInitialSessionState: () => ({
    products: shoppingSeedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
  }),
  hydratePersistedState: (value) => ({
    products: readStateArray(value, "products", isProduct),
    cart: readStateArray(value, "cart", isCartItem),
    orders: readStateArray(value, "orders", isOrder),
  }),
  buildFinalState: buildShoppingFinalState,
  evaluate: evaluateShopping,
  createRoutes: (deps) => [createShoppingRoutes(deps).handle],
};
