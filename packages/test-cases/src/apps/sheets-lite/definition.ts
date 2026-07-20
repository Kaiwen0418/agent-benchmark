import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

const expectedRowSchema = z.object({
  orderId: z.string().min(1),
  vendorName: z.string().min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  landedTotal: z.number().nonnegative(),
  decision: z.enum(["APPROVE", "REVIEW"]),
});

export const sheetsLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "sheets-lite",
  taskConfigSchema: z.object({ expectedRows: z.array(expectedRowSchema).min(1) }),
  variantPools: {
    hard: [
      {
        id: "active-equipment-under-cap",
        goal: "Join Orders to Vendors. Add exactly the equipment orders whose vendor status is active and whose landed total is at most 1,000. For each row, copy the vendor name, calculate subtotal = units × unit price, tax = subtotal × tax rate, landed total = subtotal + tax + shipping, set decision to APPROVE, then run validation.",
        taskConfig: {
          expectedRows: [
            { orderId: "PO-101", vendorName: "Northstar Components", subtotal: 600, tax: 120, landedTotal: 745, decision: "APPROVE" },
            { orderId: "PO-104", vendorName: "Cedar Supply", subtotal: 720, tax: 144, landedTotal: 894, decision: "APPROVE" },
          ],
        },
      },
      {
        id: "equipment-exception-audit",
        goal: "Join Orders to Vendors. Add exactly the equipment orders that need exception review because the vendor is not active or the landed total exceeds 1,000. For each row, copy the vendor name, calculate subtotal = units × unit price, tax = subtotal × tax rate, landed total = subtotal + tax + shipping, set decision to REVIEW, then run validation.",
        taskConfig: {
          expectedRows: [
            { orderId: "PO-102", vendorName: "Bluebird Industrial", subtotal: 600, tax: 120, landedTotal: 740, decision: "REVIEW" },
            { orderId: "PO-105", vendorName: "Delta Systems", subtotal: 600, tax: 120, landedTotal: 735, decision: "REVIEW" },
            { orderId: "PO-106", vendorName: "Northstar Components", subtotal: 1100, tax: 220, landedTotal: 1360, decision: "REVIEW" },
          ],
        },
      },
    ],
  },
});
