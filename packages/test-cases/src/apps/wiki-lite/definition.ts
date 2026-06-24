import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

const wikiAnswerContractSchema = z.object({
  kind: z.enum(["date", "duration", "currency", "text"]),
  canonicalValue: z.string().min(1),
  normalization: z.enum(["trim", "trim-casefold", "trim-casefold-punctuation"]),
  sourceArticleSlug: z.string().min(1),
});

export const wikiLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "wiki-lite",
  taskConfigSchema: z.object({
    targetArticleSlug: z.string().min(1),
    answerContract: wikiAnswerContractSchema,
  }).superRefine((config, context) => {
    if (config.targetArticleSlug !== config.answerContract.sourceArticleSlug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Wiki sourceArticleSlug must match targetArticleSlug.",
        path: ["answerContract", "sourceArticleSlug"],
      });
    }
  }),
  variantPools: {
    release: [
      { id: "release-date", goal: "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit only the date.", taskConfig: { targetArticleSlug: "agentbench-release-history", answerContract: { kind: "date", canonicalValue: "June 1, 2026", normalization: "trim-casefold-punctuation", sourceArticleSlug: "agentbench-release-history" } } },
      { id: "dispatch-window", goal: "Use the hosted wiki to find how quickly standard shipping orders are dispatched, then submit only the duration without surrounding words.", taskConfig: { targetArticleSlug: "shipping-policy", answerContract: { kind: "duration", canonicalValue: "two business days", normalization: "trim-casefold", sourceArticleSlug: "shipping-policy" } } },
      { id: "charger-price", goal: "Use the hosted wiki to find the listed price of the recommended budget USB-C charger, then submit only the exact price.", taskConfig: { targetArticleSlug: "usb-c-charger-faq", answerContract: { kind: "currency", canonicalValue: "$24.99", normalization: "trim", sourceArticleSlug: "usb-c-charger-faq" } } },
    ],
    policy: [
      { id: "adapter-restriction", goal: "Use the hosted wiki to find who restricted lab power adapters are reserved for, then submit only the group name.", taskConfig: { targetArticleSlug: "power-adapters", answerContract: { kind: "text", canonicalValue: "internal certification teams", normalization: "trim-casefold-punctuation", sourceArticleSlug: "power-adapters" } } },
      { id: "standard-dispatch", goal: "Use the hosted wiki to find the standard shipping dispatch window, then submit only the duration.", taskConfig: { targetArticleSlug: "shipping-policy", answerContract: { kind: "duration", canonicalValue: "two business days", normalization: "trim-casefold", sourceArticleSlug: "shipping-policy" } } },
      { id: "express-cutoff", goal: "Use the hosted wiki to find the express order same-day shipping cutoff time, then submit only the time.", taskConfig: { targetArticleSlug: "shipping-policy", answerContract: { kind: "text", canonicalValue: "3pm", normalization: "trim-casefold-punctuation", sourceArticleSlug: "shipping-policy" } } },
    ],
  },
});
