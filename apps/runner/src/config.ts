function readNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function readRequired(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function readOptional(name: string) {
  return process.env[name] ?? null;
}

function readBoolean(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(`${name} must be "true" or "false".`);
}

export const runnerConfig = {
  webUrl: readOptional("AGENTBENCH_WEB_URL")?.replace(/\/$/, "") ?? null,
  sharedSecret: readOptional("RUNNER_SHARED_SECRET"),
  mcpRunId: readOptional("AGENTBENCH_RUN_ID"),
  mcpSessionId: process.env.AGENTBENCH_MCP_SESSION_ID ?? null,
  mcpHttpHost: process.env.RUNNER_MCP_HTTP_HOST ?? "127.0.0.1",
  mcpHttpPort: readNumber("RUNNER_MCP_HTTP_PORT", 3002),
  mcpPublicBaseUrl: readOptional("RUNNER_MCP_PUBLIC_BASE_URL")?.replace(/\/$/, "") ?? null,
  mockSitesUrl: (process.env.MOCK_SITES_URL ?? "http://localhost:3001").replace(/\/$/, ""),
  name: process.env.RUNNER_NAME ?? "mock-runner-local",
  capacity: readNumber("RUNNER_CAPACITY", 1),
  heartbeatMs: readNumber("RUNNER_HEARTBEAT_MS", 5000),
  pollMs: readNumber("RUNNER_POLL_MS", 2500),
  headless: readBoolean("RUNNER_HEADLESS", true),
  artifactsDir: process.env.RUNNER_ARTIFACTS_DIR ?? ".runner-artifacts",
};
