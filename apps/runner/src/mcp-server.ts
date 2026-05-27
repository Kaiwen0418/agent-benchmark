import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runnerConfig } from "./config.js";
import { createRunnerMcpServer } from "./mcp-service.js";
import { McpTraceReporter } from "./mcp-trace.js";
import { ToolSession, createMcpArtifactDir } from "./tool-session.js";

const session = new ToolSession({
  artifactDirFactory: createMcpArtifactDir,
});

const traceReporter = new McpTraceReporter();
const server = createRunnerMcpServer({
  session,
  traceReporter,
  runId: runnerConfig.mcpRunId,
});

async function main() {
  if (traceReporter.isEnabled()) {
    console.info("[mcp-server] MCP trace reporting is enabled for run", runnerConfig.mcpRunId);
  } else {
    console.info("[mcp-server] MCP trace reporting is disabled");
  }

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
