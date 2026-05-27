import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { runnerConfig } from "./config.js";
import { createRunnerMcpServer } from "./mcp-service.js";
import { McpTraceReporter } from "./mcp-trace.js";
import { ToolSession, createMcpArtifactDir } from "./tool-session.js";

type McpRequest = {
  query?: Record<string, unknown>;
  body?: unknown;
  header: (name: string) => string | undefined;
};

type McpResponse = {
  headersSent: boolean;
  on: (event: string, listener: () => void) => void;
  status: (code: number) => { json: (body: unknown) => void };
  writeHead: (statusCode: number) => { end: (body?: string) => void };
};

const session = new ToolSession({
  artifactDirFactory: createMcpArtifactDir,
});

const app = createMcpExpressApp({
  host: runnerConfig.mcpHttpHost,
});

function getRunId(req: McpRequest) {
  const fromQuery = req.query?.runId;
  if (typeof fromQuery === "string" && fromQuery.length > 0) {
    return fromQuery;
  }

  const fromHeader = req.header("x-agentbench-run-id");
  if (typeof fromHeader === "string" && fromHeader.length > 0) {
    return fromHeader;
  }

  return runnerConfig.mcpRunId;
}

app.post("/mcp", async (req: McpRequest, res: McpResponse) => {
  const runId = getRunId(req);
  const traceReporter = new McpTraceReporter({
    runId,
    sessionId: req.header("x-agentbench-mcp-session-id") ?? randomUUID(),
  });
  const server = createRunnerMcpServer({
    session,
    traceReporter,
    runId,
  });

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req as never, res as never, req.body);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("[mcp-http-server] request failed", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (_req: McpRequest, res: McpResponse) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }),
  );
});

app.delete("/mcp", async (_req: McpRequest, res: McpResponse) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }),
  );
});

const server = app.listen(runnerConfig.mcpHttpPort, runnerConfig.mcpHttpHost, (error?: Error) => {
  if (error) {
    console.error("[mcp-http-server] failed to start", error);
    process.exit(1);
  }

  const publicUrl =
    runnerConfig.mcpPublicBaseUrl ?? `http://${runnerConfig.mcpHttpHost}:${runnerConfig.mcpHttpPort}`;
  console.info(`[mcp-http-server] listening at ${publicUrl}/mcp`);
});

async function closeAndExit() {
  server.close();
  await session.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void closeAndExit();
});

process.on("SIGTERM", () => {
  void closeAndExit();
});
