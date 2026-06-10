import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { WikiAnswerSubmission } from "./types.js";

export type WikiEvaluationSession = {
  app: "wiki-lite" | string;
  taskSlug: string;
  metadata: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  state: {
    wikiAnswerSubmissions: WikiAnswerSubmission[];
  };
};

export function normalizeWikiAnswer(value: string) {
  return value.trim().toLowerCase().replaceAll(/[,\.]/g, "");
}

export function evaluateWiki(session: WikiEvaluationSession): HostedWebScoreResult {
  const expectedAnswer = "June 1, 2026";
  const latestAnswer = session.state.wikiAnswerSubmissions.at(-1);
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];
  const articleViewed =
    session.events.some(
      (event) =>
        event.type === "page.load" &&
        typeof event.url === "string" &&
        String(event.url).includes("/wiki/article/agentbench-release-history"),
    ) || viewedArticleSlugs.includes("agentbench-release-history");
  const answerMatches = latestAnswer
    ? normalizeWikiAnswer(latestAnswer.answer) === normalizeWikiAnswer(expectedAnswer)
    : false;

  const retrieveValue = answerMatches
    ? passedEvaluator({
        type: "retrieve_value",
        name: "retrieved hosted-web wiki follow-up date",
        evidence: { answer: latestAnswer?.answer, expectedAnswer },
      })
    : failedEvaluator({
        type: "retrieve_value",
        name: "retrieved hosted-web wiki follow-up date",
        errorMessage: "Submitted answer does not match the expected date.",
        evidence: { answer: latestAnswer?.answer ?? null, expectedAnswer },
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
        evidence: { article: "agentbench-release-history" },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "release history article viewed",
        errorMessage: "The required article was not opened.",
      });

  return aggregateStrictScore({
    evaluators: [retrieveValue, backendState, uiState],
    passSummary: "Submitted answer matches the hosted wiki release-history task.",
    failSummary: "Wiki task requires opening the release-history article and submitting the exact date.",
  });
}
