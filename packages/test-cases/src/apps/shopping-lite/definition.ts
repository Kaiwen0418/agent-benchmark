import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const shoppingLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "shopping-lite",
  taskConfigSchema: z.object({
    targetCategory: z.enum(["charger", "cable", "adapter", "case"]),
    quantity: z.number().int().positive(),
    maxTotal: z.number().positive(),
    shippingMethod: z.enum(["standard", "express"]),
    avoidRestricted: z.boolean(),
  }),
  variantPools: {
    default: [
      { id: "budget-charger-standard", goal: "Buy exactly one charger with a total price at or below $30, use standard shipping, and avoid restricted products.", taskConfig: { targetCategory: "charger", quantity: 1, maxTotal: 30, shippingMethod: "standard", avoidRestricted: true } },
      { id: "cable-express", goal: "Buy exactly one USB-C cable with a total price at or below $10, use express shipping, and avoid restricted products.", taskConfig: { targetCategory: "cable", quantity: 1, maxTotal: 10, shippingMethod: "express", avoidRestricted: true } },
      { id: "travel-case-standard", goal: "Buy exactly one travel case with a total price at or below $15, use standard shipping, and avoid restricted products.", taskConfig: { targetCategory: "case", quantity: 1, maxTotal: 15, shippingMethod: "standard", avoidRestricted: true } },
    ],
  },
});
