import { randomUUID } from "node:crypto";
import { appendRunEvent } from "./api.js";
import { runnerConfig } from "./config.js";

type McpResponseShape = {
  content?: unknown;
  structuredContent?: unknown;
};

const connectedRuns = new Set<string>();
const runningRuns = new Set<string>();

function truncateText(value: string, limit = 280) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}...`;
}

function summarizeContent(content: unknown) {
  if (!Array.isArray(content)) {
    return null;
  }

  const textParts = content
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const text = (entry as { text?: unknown }).text;
      return typeof text === "string" ? text : null;
    })
    .filter((value): value is string => Boolean(value));

  if (textParts.length === 0) {
    return null;
  }

  return truncateText(textParts.join("\n"));
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class McpTraceReporter {
  private readonly runId: string | null;

  private readonly sessionId: string;

  private readonly enabled: boolean;

  constructor(options?: {
    runId?: string | null;
    sessionId?: string | null;
  }) {
    this.runId = options?.runId ?? runnerConfig.mcpRunId;
    this.sessionId = options?.sessionId ?? runnerConfig.mcpSessionId ?? randomUUID();
    this.enabled = Boolean(
      this.runId && runnerConfig.webUrl && runnerConfig.sharedSecret,
    );
  }

  isEnabled() {
    return this.enabled;
  }

  private buildLiveViewUrl() {
    if (!this.runId || !runnerConfig.webUrl) {
      return null;
    }

    return `${runnerConfig.webUrl}/runs/${this.runId}/live`;
  }

  private async ensureAgentLifecycle() {
    if (!this.enabled || !this.runId) {
      return;
    }

    if (!connectedRuns.has(this.runId)) {
      await appendRunEvent(this.runId, {
        type: "agent.connected",
        payload: {
          sessionId: this.sessionId,
        },
      });
      connectedRuns.add(this.runId);
    }

    if (!runningRuns.has(this.runId)) {
      await appendRunEvent(this.runId, {
        type: "run.running",
        payload: {
          sessionId: this.sessionId,
          liveViewUrl: this.buildLiveViewUrl(),
          source: "mcp",
        },
      });
      runningRuns.add(this.runId);
    }
  }

  async request(tool: string, args: Record<string, unknown>) {
    if (!this.enabled || !this.runId) {
      return;
    }

    await this.ensureAgentLifecycle();

    await appendRunEvent(this.runId, {
      type: "mcp.request",
      payload: {
        sessionId: this.sessionId,
        tool,
        args,
      },
    });
  }

  async response(
    tool: string,
    durationMs: number,
    result: McpResponseShape,
    status: "success" | "warning" = "success",
  ) {
    if (!this.enabled || !this.runId) {
      return;
    }

    await appendRunEvent(this.runId, {
      type: "mcp.response",
      payload: {
        sessionId: this.sessionId,
        tool,
        status,
        duration: `${durationMs}ms`,
        text: summarizeContent(result.content),
        structuredContent: result.structuredContent ?? null,
      },
    });
  }

  async error(tool: string, durationMs: number, error: unknown) {
    if (!this.enabled || !this.runId) {
      return;
    }

    await appendRunEvent(this.runId, {
      type: "mcp.error",
      payload: {
        sessionId: this.sessionId,
        tool,
        status: "error",
        duration: `${durationMs}ms`,
        reason: formatError(error),
      },
    });
  }
}
