import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const wikiLiteTestSupport: HostedAppTestSupport<"wiki-lite"> = {
  applyPassingState(session, config) {
    const contract = config.answerContract as Record<string, unknown>;
    const slug = configString(config, "targetArticleSlug");
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
