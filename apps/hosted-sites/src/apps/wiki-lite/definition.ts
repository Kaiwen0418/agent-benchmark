import { createWikiRoutes } from "../../routes/wiki.js";
import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateWiki } from "./evaluate.js";
import { buildWikiFinalState } from "./final-state.js";
import { getWikiDefaultGoal, getWikiStartPath, wikiSeedArticles } from "./seed.js";
import type { WikiAnswerSubmission, WikiArticle } from "./types.js";

function isWikiArticle(value: unknown): value is WikiArticle {
  return (
    isStateRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.body === "string"
  );
}

function isWikiAnswerSubmission(value: unknown): value is WikiAnswerSubmission {
  return isStateRecord(value) && typeof value.answer === "string" && typeof value.submittedAt === "string";
}

export const wikiLiteDefinition: HostedAppDefinition<"wiki-lite"> = {
  id: "wiki-lite",
  stateKeys: ["wikiArticles", "wikiAnswerSubmissions"],
  getDefaultStartPath: getWikiStartPath,
  getDefaultGoal: () => getWikiDefaultGoal(),
  buildInitialSessionState: () => ({
    wikiArticles: wikiSeedArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions: [],
  }),
  hydratePersistedState: (value) => ({
    wikiArticles: readStateArray(value, "wikiArticles", isWikiArticle),
    wikiAnswerSubmissions: readStateArray(value, "wikiAnswerSubmissions", isWikiAnswerSubmission),
  }),
  buildFinalState: buildWikiFinalState,
  evaluate: evaluateWiki,
  createRoutes: (deps) => [createWikiRoutes(deps).handle],
};
