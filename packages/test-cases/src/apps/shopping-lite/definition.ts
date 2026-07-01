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
    requiredDevice: z.string().min(1).optional(),
    couponCode: z.string().min(1).optional(),
    discountPercent: z.number().positive().max(100).optional(),
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
    hard: [
      { id: "out-of-stock-compatible-charger", goal: "Buy exactly one charger that is compatible with the ProBook laptop, with a total at or below $35, using standard shipping. Avoid restricted products. The obvious high-wattage option is out of stock, so choose the compatible charger that is actually in stock.", taskConfig: { targetCategory: "charger", quantity: 1, maxTotal: 35, shippingMethod: "standard", avoidRestricted: true, requiredDevice: "ProBook" } },
      { id: "coupon-cable-bundle", goal: "Buy exactly three USB-C cables for a team with a total at or below $28, using standard shipping. The order only fits the budget after applying coupon code CABLE20 for 20% off. Avoid restricted products.", taskConfig: { targetCategory: "cable", quantity: 3, maxTotal: 28, shippingMethod: "standard", avoidRestricted: true, couponCode: "CABLE20", discountPercent: 20 } },
      { id: "team-charger-order", goal: "Buy exactly five chargers for a team with a total at or below $120, using standard shipping. Only the in-stock budget charger keeps the order within budget. Avoid restricted products.", taskConfig: { targetCategory: "charger", quantity: 5, maxTotal: 120, shippingMethod: "standard", avoidRestricted: true } },
    ],
  },
});
