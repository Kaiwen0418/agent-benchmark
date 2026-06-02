import { createWikiRoutes } from "../../routes/wiki.js";
import type { HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateWiki } from "./evaluate.js";
import { buildWikiFinalState } from "./final-state.js";
import { getWikiDefaultGoal, getWikiStartPath, wikiSeedArticles } from "./seed.js";

export const wikiLiteDefinition: HostedAppDefinition = {
  id: "wiki-lite",
  getDefaultStartPath: getWikiStartPath,
  getDefaultGoal: () => getWikiDefaultGoal(),
  buildInitialSessionState: () => ({
    wikiArticles: wikiSeedArticles.map((article) => ({ ...article })),
    wikiAnswerSubmissions: [],
  }),
  buildFinalState: buildWikiFinalState,
  evaluate: evaluateWiki,
  createRoutes: (deps) => [createWikiRoutes(deps).handle],
};
