import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  browserClickArgsSchema,
  browserDownloadArgsSchema,
  browserExtractTextArgsSchema,
  browserGotoArgsSchema,
  browserScreenshotArgsSchema,
  browserTypeArgsSchema,
  emailOpenMockArgsSchema,
  emailSaveDraftArgsSchema,
  fileWriteArgsSchema,
  policyBlockArgsSchema,
  runCompleteArgsSchema,
} from "@agentbench/mcp-tools";
import { ToolSession } from "./tool-session.js";
import { McpTraceReporter } from "./mcp-trace.js";
import { completeRun } from "./api.js";
import { runnerConfig } from "./config.js";

type BrowserGotoArgs = z.infer<typeof browserGotoArgsSchema>;
type BrowserClickArgs = z.infer<typeof browserClickArgsSchema>;
type BrowserTypeArgs = z.infer<typeof browserTypeArgsSchema>;
type BrowserExtractTextArgs = z.infer<typeof browserExtractTextArgsSchema>;
type BrowserScreenshotArgs = z.infer<typeof browserScreenshotArgsSchema>;
type BrowserDownloadArgs = z.infer<typeof browserDownloadArgsSchema>;
type FileWriteArgs = z.infer<typeof fileWriteArgsSchema>;
type EmailOpenMockArgs = z.infer<typeof emailOpenMockArgsSchema>;
type EmailSaveDraftArgs = z.infer<typeof emailSaveDraftArgsSchema>;
type PolicyBlockArgs = z.infer<typeof policyBlockArgsSchema>;
type RunCompleteArgs = z.infer<typeof runCompleteArgsSchema>;

export function createRunnerMcpServer(params: {
  session: ToolSession;
  traceReporter?: McpTraceReporter;
  runId?: string | null;
}) {
  const { session, traceReporter, runId } = params;
  const server = new McpServer({
    name: "agentbench-runner-browser",
    version: "0.1.0",
  });

  function registerTracedTool<Schema extends z.ZodTypeAny>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: Schema;
    },
    handler: (args: z.infer<Schema>) => Promise<{ content?: unknown; structuredContent?: unknown }>,
    options?: {
      responseStatus?: "success" | "warning";
    },
  ) {
    server.registerTool(
      name,
      config,
      (async (args: unknown) => {
        const startedAt = Date.now();
        await traceReporter?.request(name, (args ?? {}) as Record<string, unknown>);

        try {
          const result = await handler(args as z.infer<Schema>);
          await traceReporter?.response(
            name,
            Date.now() - startedAt,
            result,
            options?.responseStatus ?? "success",
          );
          return result;
        } catch (error) {
          await traceReporter?.error(name, Date.now() - startedAt, error);
          throw error;
        }
      }) as never,
    );
  }

  registerTracedTool(
    "browser.goto",
    {
      title: "Navigate browser page",
      description: "Open a target URL in the controlled AgentBench browser context.",
      inputSchema: browserGotoArgsSchema,
    },
    async (args: BrowserGotoArgs) => {
      const result = await session.goto(args);
      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${result.url}${result.title ? ` (${result.title})` : ""}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "browser.click",
    {
      title: "Click browser element",
      description: "Click a DOM element using a CSS selector.",
      inputSchema: browserClickArgsSchema,
    },
    async (args: BrowserClickArgs) => {
      const result = await session.click(args);
      return {
        content: [
          {
            type: "text",
            text: `Clicked element. Current page: ${result.url}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "browser.type",
    {
      title: "Type into browser element",
      description: "Fill text into a DOM element using a CSS selector.",
      inputSchema: browserTypeArgsSchema,
    },
    async (args: BrowserTypeArgs) => {
      const result = await session.type(args);
      return {
        content: [
          {
            type: "text",
            text: `Updated element value. Current page: ${result.url}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "browser.extract_text",
    {
      title: "Extract element text",
      description: "Read text content from a DOM element.",
      inputSchema: browserExtractTextArgsSchema,
    },
    async (args: BrowserExtractTextArgs) => {
      const result = await session.extractText(args);
      return {
        content: [
          {
            type: "text",
            text: result.text,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "browser.screenshot",
    {
      title: "Capture browser screenshot",
      description: "Save a screenshot from the controlled browser page.",
      inputSchema: browserScreenshotArgsSchema,
    },
    async (args: BrowserScreenshotArgs) => {
      const result = await session.screenshot(args);
      return {
        content: [
          {
            type: "text",
            text: `Saved screenshot to ${result.path}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "browser.download",
    {
      title: "Download file from page",
      description: "Trigger a file download from the controlled browser page.",
      inputSchema: browserDownloadArgsSchema,
    },
    async (args: BrowserDownloadArgs) => {
      const result = await session.download(args);
      return {
        content: [
          {
            type: "text",
            text: `Downloaded ${result.fileName} to ${result.path}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "file.write",
    {
      title: "Write workspace file",
      description: "Write a text file into the runner sandbox workspace.",
      inputSchema: fileWriteArgsSchema,
    },
    async (args: FileWriteArgs) => {
      const result = await session.writeFile(args);
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${result.fileName} to ${result.path}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "email.open_mock",
    {
      title: "Open mock email thread",
      description: "Open a thread in the deterministic mock email workspace.",
      inputSchema: emailOpenMockArgsSchema,
    },
    async (args: EmailOpenMockArgs) => {
      const result = await session.openMockEmail(args);
      return {
        content: [
          {
            type: "text",
            text: `Opened mock mailbox ${result.mailbox} at ${result.url}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "email.save_draft",
    {
      title: "Save mock email draft",
      description: "Save a draft in the deterministic mock email workspace.",
      inputSchema: emailSaveDraftArgsSchema,
    },
    async (args: EmailSaveDraftArgs) => {
      const result = await session.saveMockDraft(args);
      return {
        content: [
          {
            type: "text",
            text: `Saved draft with status ${result.expectedStatus}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  registerTracedTool(
    "policy.block",
    {
      title: "Record policy block",
      description: "Record that an action was blocked by benchmark policy.",
      inputSchema: policyBlockArgsSchema,
    },
    async (args: PolicyBlockArgs) => {
      const result = await session.blockPolicy(args);
      return {
        content: [
          {
            type: "text",
            text: result.reason,
          },
        ],
        structuredContent: result,
      };
    },
    {
      responseStatus: "warning",
    },
  );

  registerTracedTool(
    "run.complete",
    {
      title: "Complete benchmark run",
      description: "Mark the current AgentBench run as completed after the objective is satisfied.",
      inputSchema: runCompleteArgsSchema,
    },
    async (args: RunCompleteArgs) => {
      const activeRunId = runId ?? runnerConfig.mcpRunId ?? null;
      if (!activeRunId) {
        throw new Error("AGENTBENCH_RUN_ID is required to complete a benchmark run.");
      }

      await completeRun(activeRunId, {
        status: "completed",
        score: args.score ?? null,
        errorMessage: null,
        artifacts: session.getRecordedArtifacts(),
      });

      return {
        content: [
          {
            type: "text",
            text: args.summary
              ? `Run marked complete. ${args.summary}`
              : "Run marked complete.",
          },
        ],
        structuredContent: {
          runId: activeRunId,
          status: "completed",
          score: args.score ?? null,
          summary: args.summary ?? null,
        },
      };
    },
  );

  return server;
}
