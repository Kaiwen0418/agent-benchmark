import type { HostedWebScoreResult } from "@agentbench/scoring";
import { evaluateSession as evaluateRegisteredSession } from "./runtime/app-registry.js";
import type { HostedSession } from "./runtime/types.js";

export type HostedEvaluationSession = HostedSession;

export function evaluateSession(session: HostedEvaluationSession): HostedWebScoreResult {
  return evaluateRegisteredSession(session);
}
