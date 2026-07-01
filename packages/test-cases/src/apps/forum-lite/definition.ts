import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const forumLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "forum-lite",
  taskConfigSchema: z
    .object({
      targetThreadId: z.string().min(1),
      expectedReplyValue: z.string().url(),
      expectedLockReason: z.string().min(1),
      requiresPin: z.boolean().optional(),
      requiresReport: z.boolean().optional(),
      expectedReportReason: z.string().min(1).optional(),
      requiresMove: z.boolean().optional(),
      expectedCategory: z.string().min(1).optional(),
      requiresEditTitle: z.boolean().optional(),
      expectedTitle: z.string().min(1).optional(),
      requiresMarkDuplicate: z.boolean().optional(),
      canonicalThreadId: z.string().min(1).optional(),
      duplicateThreadIds: z.array(z.string().min(1)).min(1).optional(),
      requiredActionOrder: z
        .array(z.enum(["report", "move", "edit_title", "mark_duplicate", "lock", "pin"]))
        .min(2)
        .optional(),
    })
    .superRefine((config, context) => {
      if (config.requiresMove && !config.expectedCategory) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "expectedCategory is required when requiresMove is set.",
          path: ["expectedCategory"],
        });
      }
      if (config.requiresEditTitle && !config.expectedTitle) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "expectedTitle is required when requiresEditTitle is set.",
          path: ["expectedTitle"],
        });
      }
      if (config.requiresMarkDuplicate && (!config.duplicateThreadIds || config.duplicateThreadIds.length === 0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicateThreadIds is required when requiresMarkDuplicate is set.",
          path: ["duplicateThreadIds"],
        });
      }
    }),
  variantPools: {
    default: [
      { id: "battery-recall", goal: "Find the battery swelling thread, reply with the official recall link from the support post, then lock it with reason 'safety escalation'.", taskConfig: { targetThreadId: "thr-battery", expectedReplyValue: "https://support.example.com/recall/battery-2026", expectedLockReason: "safety escalation" } },
      { id: "wifi-reset", goal: "Find the 5GHz connectivity thread, reply with the official reset-guide link from support, then lock it with reason 'resolved with guide'.", taskConfig: { targetThreadId: "thr-wifi", expectedReplyValue: "https://support.example.com/network/5ghz-reset", expectedLockReason: "resolved with guide" } },
      { id: "screen-advisory", goal: "Find the low-brightness flickering thread, reply with the display calibration advisory link, then lock it with reason 'known display issue'.", taskConfig: { targetThreadId: "thr-screen", expectedReplyValue: "https://support.example.com/display/flicker-calibration", expectedLockReason: "known display issue" } },
      { id: "battery-recall-pin", goal: "Find the battery swelling thread, reply with the official recall link from the support post, lock it with reason 'safety escalation', then pin it.", taskConfig: { targetThreadId: "thr-battery", expectedReplyValue: "https://support.example.com/recall/battery-2026", expectedLockReason: "safety escalation", requiresPin: true } },
      { id: "wifi-reset-report", goal: "Find the 5GHz connectivity thread, submit a moderation report with reason 'needs escalation', then reply with the reset-guide link and lock it with reason 'resolved with guide'.", taskConfig: { targetThreadId: "thr-wifi", expectedReplyValue: "https://support.example.com/network/5ghz-reset", expectedLockReason: "resolved with guide", requiresReport: true, expectedReportReason: "needs escalation" } },
      { id: "screen-advisory-both", goal: "Find the low-brightness flickering thread, submit a report with reason 'duplicate issue', reply with the display calibration advisory link, lock it with reason 'known display issue', then pin it.", taskConfig: { targetThreadId: "thr-screen", expectedReplyValue: "https://support.example.com/display/flicker-calibration", expectedLockReason: "known display issue", requiresReport: true, expectedReportReason: "duplicate issue", requiresPin: true } },
    ],
    // Hard triage variants (#112): identify the canonical thread among similar
    // titles, then apply the new moderation actions (move / edit_title /
    // mark_duplicate) before the terminal lock.
    hard: [
      { id: "charge-duplicate-triage", goal: "Three threads report the same USB-C charging regression. Identify the canonical thread that carries the official fix link, reply there with that link, mark the two duplicate threads ('thr-charge-dup1' and 'thr-charge-dup2') as duplicates of the canonical thread, then lock the canonical thread with reason 'resolved with guide'.", taskConfig: { targetThreadId: "thr-charge-main", expectedReplyValue: "https://support.example.com/hardware/usb-c-charging-fix", expectedLockReason: "resolved with guide", requiresMarkDuplicate: true, canonicalThreadId: "thr-charge-main", duplicateThreadIds: ["thr-charge-dup1", "thr-charge-dup2"] } },
      { id: "misfiled-safety-escalation", goal: "A safety report about a smoking wall adapter was filed under the wrong category. Move the thread to the 'safety' category, reply with the official advisory link, then lock it with reason 'safety escalation'.", taskConfig: { targetThreadId: "thr-misfiled-safety", expectedReplyValue: "https://support.example.com/safety/adapter-smoke", expectedLockReason: "safety escalation", requiresMove: true, expectedCategory: "safety" } },
      { id: "vague-title-cleanup", goal: "A networking thread has an unhelpful title. Rename it to 'DNS resolution failures on wired connection', reply with the official DNS reset guide link, then lock it with reason 'resolved with guide'.", taskConfig: { targetThreadId: "thr-vague-title", expectedReplyValue: "https://support.example.com/network/dns-reset", expectedLockReason: "resolved with guide", requiresEditTitle: true, expectedTitle: "DNS resolution failures on wired connection" } },
      { id: "hot-charge-consolidate", goal: "A fast-charge overheating report was miscategorized and has a near-duplicate. Move the main thread to the 'safety' category, mark 'thr-hot-dup' as a duplicate of it, reply with the official advisory link, then lock it with reason 'safety escalation'.", taskConfig: { targetThreadId: "thr-hot-main", expectedReplyValue: "https://support.example.com/safety/fast-charge-heat", expectedLockReason: "safety escalation", requiresMove: true, expectedCategory: "safety", requiresMarkDuplicate: true, canonicalThreadId: "thr-hot-main", duplicateThreadIds: ["thr-hot-dup"] } },
      { id: "hot-charge-full-escalation", goal: "Fully triage the fast-charge overheating incident in this exact moderation order: report the main thread with reason 'thermal incident', move it to 'safety', rename it to 'Fast-charge overheating safety incident', mark 'thr-hot-dup' as its duplicate, reply with the official advisory link, lock it with reason 'safety escalation', then pin it. Do not lock early.", taskConfig: { targetThreadId: "thr-hot-main", expectedReplyValue: "https://support.example.com/safety/fast-charge-heat", expectedLockReason: "safety escalation", requiresReport: true, expectedReportReason: "thermal incident", requiresMove: true, expectedCategory: "safety", requiresEditTitle: true, expectedTitle: "Fast-charge overheating safety incident", requiresMarkDuplicate: true, canonicalThreadId: "thr-hot-main", duplicateThreadIds: ["thr-hot-dup"], requiresPin: true, requiredActionOrder: ["report", "move", "edit_title", "mark_duplicate", "lock", "pin"] } },
    ],
  },
});
