import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { WikiAnswerSubmission, WikiArticle } from "./types.js";
import {
  normalizeWikiAnswer,
  readWikiAnswerContract,
  validateWikiAnswerSource,
} from "./answer-contract.js";

export type WikiEvaluationSession = {
  app: "wiki-lite" | string;
  taskSlug: string;
  metadata: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  state: {
    wikiArticles: WikiArticle[];
    wikiAnswerSubmissions: WikiAnswerSubmission[];
  };
};

export function evaluateWiki(session: WikiEvaluationSession): HostedWebScoreResult {
  const answerContract = readWikiAnswerContract(session.metadata);
  validateWikiAnswerSource(answerContract, session.state.wikiArticles);
  const expectedAnswer = answerContract.canonicalValue;
  const targetArticleSlug = answerContract.sourceArticleSlug;
  const latestAnswer = session.state.wikiAnswerSubmissions.at(-1);
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];
  const articleViewed =
    session.events.some(
      (event) =>
        event.type === "page.load" &&
        typeof event.url === "string" &&
        String(event.url).includes(`/wiki/article/${targetArticleSlug}`),
    ) || viewedArticleSlugs.includes(targetArticleSlug);
  const answerMatches = latestAnswer
    ? normalizeWikiAnswer(latestAnswer.answer, answerContract.normalization) ===
      normalizeWikiAnswer(expectedAnswer, answerContract.normalization)
    : false;

  const retrieveValue = answerMatches
    ? passedEvaluator({
        type: "retrieve_value",
        name: "retrieved generated wiki answer",
        evidence: { answer: latestAnswer?.answer, expectedAnswer },
      })
    : failedEvaluator({
        type: "retrieve_value",
        name: "retrieved generated wiki answer",
        errorMessage: `Submitted answer does not match the expected ${answerContract.kind}.`,
        evidence: { answer: latestAnswer?.answer ?? null, expectedAnswer, answerKind: answerContract.kind },
      });
  const backendState = latestAnswer
    ? passedEvaluator({
        type: "backend_state",
        name: "answer submission persisted",
        evidence: { answer: latestAnswer.answer, submittedAt: latestAnswer.submittedAt },
      })
    : failedEvaluator({
        type: "backend_state",
        name: "answer submission persisted",
        errorMessage: "No answer was submitted.",
      });
  const uiState = articleViewed
    ? passedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        evidence: { article: targetArticleSlug },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        errorMessage: "The required article was not opened.",
      });

  return aggregateStrictScore({
    evaluators: [retrieveValue, backendState, uiState],
    passSummary: "Submitted answer matches the generated hosted wiki task.",
    failSummary: "Wiki task requires opening the generated target article and submitting the exact answer.",
  });
}
