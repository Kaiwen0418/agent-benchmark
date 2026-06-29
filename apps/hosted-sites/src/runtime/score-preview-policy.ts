import type { HostedSession } from "./types.js";
import { isTerminalHostedSessionStatus } from "./types.js";
import type { HostedWebScoreResult } from "@agentbench/scoring";

export type ScorePreviewMode = "disabled" | "dev" | "token";

export function parseScorePreviewMode(value: string | undefined): ScorePreviewMode {
  if (value === "disabled" || value === "token") {
    return value;
  }
  return "dev";
}

export function isScorePreviewAllowed(session: HostedSession): boolean {
  const mode = session.scorePreviewMode ?? "dev";
  if (mode === "dev") {
    return true;
  }
  if (mode === "disabled") {
    return false;
  }
  return session.accessMode === "viewer";
}

export function isActiveScoreApiAllowed(session: HostedSession): boolean {
  if (isTerminalHostedSessionStatus(session.status)) {
    return true;
  }
  return isScorePreviewAllowed(session);
}

export function shouldRenderScorePreview(session: HostedSession): boolean {
  if (isTerminalHostedSessionStatus(session.status)) {
    return true;
  }
  return isScorePreviewAllowed(session);
}

export function sanitizeScoreResult(
  result: HostedWebScoreResult,
  session: HostedSession,
): HostedWebScoreResult {
  if (isScorePreviewAllowed(session)) {
    return result;
  }
  return {
    ...result,
    evaluators: result.evaluators.map((evaluator) => {
      const { evidence: _evidence, ...redacted } = evaluator;
      return redacted;
    }),
  };
}
