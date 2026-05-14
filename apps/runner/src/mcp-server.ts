import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
} from "@agentbench/mcp-tools";
import { ToolSession, createMcpArtifactDir } from "./tool-session.js";

const session = new ToolSession({
  artifactDirFactory: createMcpArtifactDir,
});

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

const server = new McpServer({
  name: "agentbench-runner-browser",
  version: "0.1.0",
});

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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

server.registerTool(
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
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on("SIGINT", async () => {
  await session.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await session.close();
  process.exit(0);
});

void main().catch(async (error) => {
  console.error("[mcp-server] fatal error", error);
  await session.close();
  process.exit(1);
});
