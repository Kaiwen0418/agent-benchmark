import type { HostedWebScoreResult } from "@agentbench/scoring";
import { evaluateForum, type ForumEvaluationSession } from "./apps/forum-lite/evaluate.js";
import { evaluateShopping, type ShoppingEvaluationSession } from "./apps/shopping-lite/evaluate.js";
import { evaluateWiki, type WikiEvaluationSession } from "./apps/wiki-lite/evaluate.js";

export type HostedEvaluationSession = ShoppingEvaluationSession | WikiEvaluationSession | ForumEvaluationSession;

export { evaluateShopping, evaluateWiki, evaluateForum };

export function evaluateSession(session: HostedEvaluationSession): HostedWebScoreResult {
  if (session.app === "wiki-lite") {
    return evaluateWiki(session as WikiEvaluationSession);
  }
  if (session.app === "forum-lite") {
    return evaluateForum(session as ForumEvaluationSession);
  }
  return evaluateShopping(session as ShoppingEvaluationSession);
}
