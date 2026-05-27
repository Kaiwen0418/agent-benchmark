import { z } from "zod";

export const browserToolNameSchema = z.enum([
  "browser.goto",
  "browser.click",
  "browser.type",
  "browser.extract_text",
  "browser.screenshot",
  "browser.download",
]);

export type BrowserToolName = z.infer<typeof browserToolNameSchema>;

export const browserGotoArgsSchema = z.object({
  url: z.string().url(),
});

export const browserClickArgsSchema = z.object({
  selector: z.string().min(1),
});

export const browserTypeArgsSchema = z.object({
  selector: z.string().min(1),
  text: z.string(),
});

export const browserExtractTextArgsSchema = z.object({
  selector: z.string().min(1),
});

export const browserScreenshotArgsSchema = z.object({
  path: z.string().min(1),
  fullPage: z.boolean().optional().default(true),
});

export const browserDownloadArgsSchema = z.object({
  selector: z.string().min(1),
});

export const browserToolSchemas = {
  "browser.goto": browserGotoArgsSchema,
  "browser.click": browserClickArgsSchema,
  "browser.type": browserTypeArgsSchema,
  "browser.extract_text": browserExtractTextArgsSchema,
  "browser.screenshot": browserScreenshotArgsSchema,
  "browser.download": browserDownloadArgsSchema,
} as const;

export const browserToolCallSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("browser.goto"),
    args: browserGotoArgsSchema,
  }),
  z.object({
    tool: z.literal("browser.click"),
    args: browserClickArgsSchema,
  }),
  z.object({
    tool: z.literal("browser.type"),
    args: browserTypeArgsSchema,
  }),
  z.object({
    tool: z.literal("browser.extract_text"),
    args: browserExtractTextArgsSchema,
  }),
  z.object({
    tool: z.literal("browser.screenshot"),
    args: browserScreenshotArgsSchema,
  }),
  z.object({
    tool: z.literal("browser.download"),
    args: browserDownloadArgsSchema,
  }),
]);

export type BrowserToolCall = z.infer<typeof browserToolCallSchema>;

export const browserToolResultSchema = z.object({
  tool: browserToolNameSchema,
  status: z.enum(["success", "warning", "error"]),
  durationMs: z.number().nonnegative(),
  summary: z.string().optional(),
  output: z.record(z.unknown()).optional(),
});

export type BrowserToolResult = z.infer<typeof browserToolResultSchema>;

export const fileWriteArgsSchema = z.object({
  path: z.string().min(1),
  contents: z.string(),
});

export type FileWriteArgs = z.infer<typeof fileWriteArgsSchema>;

export const emailOpenMockArgsSchema = z.object({
  mailbox: z.string().min(1).optional().default("support"),
  selector: z.string().min(1).optional().default("#message"),
});

export type EmailOpenMockArgs = z.infer<typeof emailOpenMockArgsSchema>;

export const emailSaveDraftArgsSchema = z.object({
  selector: z.string().min(1).optional().default("#save"),
  statusSelector: z.string().min(1).optional().default("#status"),
  expectedStatus: z.string().min(1).optional().default("Draft saved"),
});

export type EmailSaveDraftArgs = z.infer<typeof emailSaveDraftArgsSchema>;

export const policyBlockArgsSchema = z.object({
  reason: z.string().min(1),
});

export type PolicyBlockArgs = z.infer<typeof policyBlockArgsSchema>;

export const runCompleteArgsSchema = z.object({
  score: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export type RunCompleteArgs = z.infer<typeof runCompleteArgsSchema>;

export const agentbenchToolNameSchema = z.enum([
  ...browserToolNameSchema.options,
  "file.write",
  "email.open_mock",
  "email.save_draft",
  "policy.block",
  "run.complete",
]);

export type AgentbenchToolName = z.infer<typeof agentbenchToolNameSchema>;

export const agentbenchToolCallSchema = z.discriminatedUnion("tool", [
  ...browserToolCallSchema.options,
  z.object({
    tool: z.literal("file.write"),
    args: fileWriteArgsSchema,
  }),
  z.object({
    tool: z.literal("email.open_mock"),
    args: emailOpenMockArgsSchema,
  }),
  z.object({
    tool: z.literal("email.save_draft"),
    args: emailSaveDraftArgsSchema,
  }),
  z.object({
    tool: z.literal("policy.block"),
    args: policyBlockArgsSchema,
  }),
  z.object({
    tool: z.literal("run.complete"),
    args: runCompleteArgsSchema,
  }),
]);

export type AgentbenchToolCall = z.infer<typeof agentbenchToolCallSchema>;

export const browserToolDefinitions = [
  {
    name: "browser.goto",
    title: "Navigate browser page",
    description: "Open a target URL in the controlled browser context.",
    inputSchema: browserGotoArgsSchema,
  },
  {
    name: "browser.click",
    title: "Click browser element",
    description: "Click a DOM element using a CSS selector.",
    inputSchema: browserClickArgsSchema,
  },
  {
    name: "browser.type",
    title: "Type into browser element",
    description: "Fill or type text into a DOM element using a CSS selector.",
    inputSchema: browserTypeArgsSchema,
  },
  {
    name: "browser.extract_text",
    title: "Extract element text",
    description: "Read text content from a DOM element in the browser page.",
    inputSchema: browserExtractTextArgsSchema,
  },
  {
    name: "browser.screenshot",
    title: "Capture browser screenshot",
    description: "Save a screenshot from the controlled browser page.",
    inputSchema: browserScreenshotArgsSchema,
  },
  {
    name: "browser.download",
    title: "Download file from page",
    description: "Trigger a file download from the controlled browser page.",
    inputSchema: browserDownloadArgsSchema,
  },
  {
    name: "file.write",
    title: "Write workspace file",
    description: "Write a text file into the runner sandbox workspace.",
    inputSchema: fileWriteArgsSchema,
  },
  {
    name: "email.open_mock",
    title: "Open mock email thread",
    description: "Open a message in the deterministic mock email workspace.",
    inputSchema: emailOpenMockArgsSchema,
  },
  {
    name: "email.save_draft",
    title: "Save mock email draft",
    description: "Save a draft in the deterministic mock email workspace.",
    inputSchema: emailSaveDraftArgsSchema,
  },
  {
    name: "policy.block",
    title: "Record policy block",
    description: "Record that an action was blocked by benchmark policy.",
    inputSchema: policyBlockArgsSchema,
  },
  {
    name: "run.complete",
    title: "Complete benchmark run",
    description: "Mark the current AgentBench run as completed after the task objective is satisfied.",
    inputSchema: runCompleteArgsSchema,
  },
] as const;
