import { createShoppingRoutes } from "../../routes/shopping.js";
import type { HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateShopping } from "./evaluate.js";
import { buildShoppingFinalState } from "./final-state.js";
import { getShoppingDefaultGoal, getShoppingStartPath, shoppingSeedProducts } from "./seed.js";

export const shoppingLiteDefinition: HostedAppDefinition = {
  id: "shopping-lite",
  getDefaultStartPath: getShoppingStartPath,
  getDefaultGoal: () => getShoppingDefaultGoal(),
  buildInitialSessionState: () => ({
    products: shoppingSeedProducts.map((product) => ({ ...product })),
    cart: [],
    orders: [],
  }),
  buildFinalState: buildShoppingFinalState,
  evaluate: evaluateShopping,
  createRoutes: (deps) => [createShoppingRoutes(deps).handle],
};
