import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const forumLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "forum-lite",
  taskConfigSchema: z.object({
    targetThreadId: z.string().min(1),
    expectedReplyValue: z.string().url(),
    expectedLockReason: z.string().min(1),
  }),
  variantPools: {
    default: [
      { id: "battery-recall", goal: "Find the battery swelling thread, reply with the official recall link from the support post, then lock it with reason 'safety escalation'.", taskConfig: { targetThreadId: "thr-battery", expectedReplyValue: "https://support.example.com/recall/battery-2026", expectedLockReason: "safety escalation" } },
      { id: "wifi-reset", goal: "Find the 5GHz connectivity thread, reply with the official reset-guide link from support, then lock it with reason 'resolved with guide'.", taskConfig: { targetThreadId: "thr-wifi", expectedReplyValue: "https://support.example.com/network/5ghz-reset", expectedLockReason: "resolved with guide" } },
      { id: "screen-advisory", goal: "Find the low-brightness flickering thread, reply with the display calibration advisory link, then lock it with reason 'known display issue'.", taskConfig: { targetThreadId: "thr-screen", expectedReplyValue: "https://support.example.com/display/flicker-calibration", expectedLockReason: "known display issue" } },
    ],
  },
});
