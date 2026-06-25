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
    secondaryArticleSlug: z.string().min(1).optional(),
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
      { id: "release-to-charger-price", goal: "The release history article references the USB-C Charger FAQ for recommended accessories. Open both articles and submit the exact price of the recommended budget charger.", taskConfig: { targetArticleSlug: "usb-c-charger-faq", secondaryArticleSlug: "agentbench-release-history", answerContract: { kind: "currency", canonicalValue: "$24.99", normalization: "trim", sourceArticleSlug: "usb-c-charger-faq" } } },
      { id: "dispatch-with-adapters", goal: "The power adapter safety article references the shipping policy for dispatch timing. Open both articles and submit the standard shipping dispatch window.", taskConfig: { targetArticleSlug: "shipping-policy", secondaryArticleSlug: "power-adapters", answerContract: { kind: "duration", canonicalValue: "two business days", normalization: "trim-casefold", sourceArticleSlug: "shipping-policy" } } },
    ],
    policy: [
      { id: "adapter-restriction", goal: "Use the hosted wiki to find who restricted lab power adapters are reserved for, then submit only the group name.", taskConfig: { targetArticleSlug: "power-adapters", answerContract: { kind: "text", canonicalValue: "internal certification teams", normalization: "trim-casefold-punctuation", sourceArticleSlug: "power-adapters" } } },
      { id: "standard-dispatch", goal: "Use the hosted wiki to find the standard shipping dispatch window, then submit only the duration.", taskConfig: { targetArticleSlug: "shipping-policy", answerContract: { kind: "duration", canonicalValue: "two business days", normalization: "trim-casefold", sourceArticleSlug: "shipping-policy" } } },
      { id: "express-cutoff", goal: "Use the hosted wiki to find the express order same-day shipping cutoff time, then submit only the time.", taskConfig: { targetArticleSlug: "shipping-policy", answerContract: { kind: "text", canonicalValue: "3pm", normalization: "trim-casefold-punctuation", sourceArticleSlug: "shipping-policy" } } },
      { id: "adapter-to-shipping", goal: "The shipping policy references the power adapter safety article for restricted equipment rules. Open both articles and submit who restricted lab power adapters are reserved for.", taskConfig: { targetArticleSlug: "power-adapters", secondaryArticleSlug: "shipping-policy", answerContract: { kind: "text", canonicalValue: "internal certification teams", normalization: "trim-casefold-punctuation", sourceArticleSlug: "power-adapters" } } },
      { id: "express-to-history", goal: "The release history article references the shipping policy for delivery details. Open both articles and submit the express order same-day shipping cutoff time.", taskConfig: { targetArticleSlug: "shipping-policy", secondaryArticleSlug: "agentbench-release-history", answerContract: { kind: "text", canonicalValue: "3pm", normalization: "trim-casefold-punctuation", sourceArticleSlug: "shipping-policy" } } },
    ],
  },
});
