import type { HostedWebScoreResult } from "@agentbench/scoring";
import { evaluateShopping, type ShoppingEvaluationSession } from "./apps/shopping-lite/evaluate.js";
import { evaluateWiki, type WikiEvaluationSession } from "./apps/wiki-lite/evaluate.js";

export type HostedEvaluationSession = ShoppingEvaluationSession | WikiEvaluationSession;

export { evaluateShopping, evaluateWiki };

export function evaluateSession(session: HostedEvaluationSession): HostedWebScoreResult {
  return session.app === "wiki-lite"
    ? evaluateWiki(session as WikiEvaluationSession)
    : evaluateShopping(session as ShoppingEvaluationSession);
}
