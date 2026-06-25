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
    secondaryCategory: z.enum(["charger", "cable", "adapter", "case"]).optional(),
    secondaryQuantity: z.number().int().positive().optional(),
    freeShippingThreshold: z.number().nonnegative().optional(),
    shippingCost: z.number().nonnegative().optional(),
  }),
  variantPools: {
    default: [
      { id: "budget-charger-standard", goal: "Buy exactly one charger with a total price at or below $30, use standard shipping, and avoid restricted products.", taskConfig: { targetCategory: "charger", quantity: 1, maxTotal: 30, shippingMethod: "standard", avoidRestricted: true } },
      { id: "cable-express", goal: "Buy exactly one USB-C cable with a total price at or below $10, use express shipping, and avoid restricted products.", taskConfig: { targetCategory: "cable", quantity: 1, maxTotal: 10, shippingMethod: "express", avoidRestricted: true } },
      { id: "travel-case-standard", goal: "Buy exactly one travel case with a total price at or below $15, use standard shipping, and avoid restricted products.", taskConfig: { targetCategory: "case", quantity: 1, maxTotal: 15, shippingMethod: "standard", avoidRestricted: true } },
      { id: "combo-charger-cable", goal: "Buy one charger and one USB-C cable with a total price at or below $35, use standard shipping, and avoid restricted products.", taskConfig: { targetCategory: "charger", quantity: 1, maxTotal: 35, shippingMethod: "standard", avoidRestricted: true, secondaryCategory: "cable", secondaryQuantity: 1 } },
      { id: "travel-kit-free-shipping", goal: "Buy one charger and one travel case with a total price at or below $40. Standard shipping is free for orders $35 and over; otherwise standard shipping costs $5. Avoid restricted products.", taskConfig: { targetCategory: "charger", quantity: 1, maxTotal: 40, shippingMethod: "standard", avoidRestricted: true, secondaryCategory: "case", secondaryQuantity: 1, freeShippingThreshold: 35, shippingCost: 5 } },
      { id: "cable-budget-shipping", goal: "Buy one USB-C cable and one travel case with a total price at or below $25. Standard shipping is free for orders $20 and over; otherwise standard shipping costs $4. Avoid restricted products.", taskConfig: { targetCategory: "cable", quantity: 1, maxTotal: 25, shippingMethod: "standard", avoidRestricted: true, secondaryCategory: "case", secondaryQuantity: 1, freeShippingThreshold: 20, shippingCost: 4 } },
    ],
  },
});
