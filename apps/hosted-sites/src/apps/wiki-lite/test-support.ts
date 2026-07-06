import { configString, configStringOrNull, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const wikiLiteTestSupport: HostedAppTestSupport<"wiki-lite"> = {
  exampleTaskConfig: {
    targetArticleSlug: "agentbench-release-history",
    answerContract: {
      kind: "date",
      canonicalValue: "June 1, 2026",
      normalization: "trim-casefold-punctuation",
      sourceArticleSlug: "agentbench-release-history",
    },
  },
  applyPassingState(session, config) {
    const contract = config.answerContract as Record<string, unknown>;
    const slug = configString(config, "targetArticleSlug");
    const secondarySlug = configStringOrNull(config, "secondaryArticleSlug");
    const requiredSlugs = Array.isArray(config.requiredArticleSlugs)
      ? config.requiredArticleSlugs.filter((value): value is string => typeof value === "string")
      : [];
    if (secondarySlug) {
      session.events.push({ type: "page.load", url: `/wiki/article/${secondarySlug}` });
    }
    for (const requiredSlug of requiredSlugs) {
      session.events.push({ type: "page.load", url: `/wiki/article/${requiredSlug}` });
    }
    session.events.push({ type: "page.load", url: `/wiki/article/${slug}` });
    session.state.wikiAnswerSubmissions.push({
      answer: configString(contract, "canonicalValue"),
      submittedAt: "2026-06-01T00:00:00.000Z",
    });
  },
  breakPassingState(session) {
    session.state.wikiAnswerSubmissions[0]!.answer = "wrong answer";
  },
};
