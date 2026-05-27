import { createHmac, timingSafeEqual } from "node:crypto";

type McpSessionClaims = {
  runId: string;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 60 * 30;

function getSecret() {
  return process.env.MCP_SESSION_SECRET ?? process.env.RUNNER_SHARED_SECRET ?? null;
}

function base64urlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(unsigned: string, secret: string) {
  return createHmac("sha256", secret).update(unsigned).digest("base64url");
}

export function getMcpUpstreamBase(origin: string) {
  const configured = process.env.AGENTBENCH_MCP_BASE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return "http://127.0.0.1:3002/mcp";
    }
  } catch {
    return null;
  }

  return null;
}

export function createMcpSessionToken(runId: string, now = Date.now()) {
  const secret = getSecret();
  if (!secret) {
    return null;
  }

  const payload: McpSessionClaims = {
    runId,
    exp: Math.floor(now / 1000) + DEFAULT_TTL_SECONDS,
  };

  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyMcpSessionToken(token: string, expectedRunId: string, now = Date.now()) {
  const secret = getSecret();
  if (!secret) {
    return { ok: false as const, reason: "missing_secret" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false as const, reason: "invalid_format" };
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = sign(encodedPayload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { ok: false as const, reason: "invalid_signature" };
  }

  let payload: McpSessionClaims;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload)) as McpSessionClaims;
  } catch {
    return { ok: false as const, reason: "invalid_payload" };
  }

  if (payload.runId !== expectedRunId) {
    return { ok: false as const, reason: "run_mismatch" };
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    return { ok: false as const, reason: "expired" };
  }

  return { ok: true as const, payload };
}

