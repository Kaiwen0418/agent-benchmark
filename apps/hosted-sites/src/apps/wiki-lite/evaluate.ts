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
import { configStringArray, configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";

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
  const taskConfig = readTaskConfig(session.metadata);
  const secondaryArticleSlug = configStringOrNull(taskConfig, "secondaryArticleSlug");
  const requiredArticleSlugs = configStringArray(taskConfig, "requiredArticleSlugs");
  const latestAnswer = session.state.wikiAnswerSubmissions.at(-1);
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];

  const isArticleViewed = (slug: string) =>
    session.events.some(
      (event) =>
        event.type === "page.load" &&
        typeof event.url === "string" &&
        String(event.url).includes(`/wiki/article/${slug}`),
    ) || viewedArticleSlugs.includes(slug);

  const targetArticleViewed = isArticleViewed(targetArticleSlug);
  const secondaryArticleViewed = secondaryArticleSlug == null || isArticleViewed(secondaryArticleSlug);
  const requiredArticlesViewed = requiredArticleSlugs.every(isArticleViewed);
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
  const targetUiState = targetArticleViewed
    ? passedEvaluator({
        type: "ui_state",
        name: "target article viewed",
        evidence: { article: targetArticleSlug },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "target article viewed",
        errorMessage: "The required target article was not opened.",
      });
  const secondaryUiState =
    secondaryArticleSlug == null
      ? passedEvaluator({
          type: "ui_state",
          name: "secondary article not required",
          required: false,
          evidence: { secondaryArticleSlug: null },
        })
      : secondaryArticleViewed
        ? passedEvaluator({
            type: "ui_state",
            name: "secondary article viewed",
            evidence: { secondaryArticleSlug },
          })
        : failedEvaluator({
            type: "ui_state",
            name: "secondary article viewed",
            errorMessage: `The required secondary article was not opened: ${secondaryArticleSlug}.`,
            evidence: { secondaryArticleSlug },
          });
  const requiredArticlesUiState =
    requiredArticleSlugs.length === 0 || requiredArticlesViewed
      ? passedEvaluator({
          type: "ui_state",
          name: "required article set viewed",
          required: requiredArticleSlugs.length > 0,
          evidence: { articleCount: requiredArticleSlugs.length },
        })
      : failedEvaluator({
          type: "ui_state",
          name: "required article set viewed",
          errorMessage: "One or more required articles were not opened.",
          evidence: { articleCount: requiredArticleSlugs.length },
        });

  return aggregateStrictScore({
    evaluators: [retrieveValue, backendState, targetUiState, secondaryUiState, requiredArticlesUiState],
    passSummary: secondaryArticleSlug
      ? "Submitted answer matches the generated hosted wiki task after opening both required articles."
      : "Submitted answer matches the generated hosted wiki task.",
    failSummary: "Wiki task requires opening the generated target article and any required secondary article, then submitting the exact answer.",
  });
}
