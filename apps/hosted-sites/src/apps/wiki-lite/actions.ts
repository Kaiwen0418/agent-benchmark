import type { HostedSessionFor } from "../../runtime/types.js";

type WikiSession = HostedSessionFor<"wiki-lite">;

export function markArticleViewed(session: WikiSession, articleSlug: string) {
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];

  if (viewedArticleSlugs.includes(articleSlug)) {
    return false;
  }

  session.metadata = {
    ...session.metadata,
    viewedArticleSlugs: [...viewedArticleSlugs, articleSlug],
  };
  return true;
}

export function submitWikiAnswer(
  session: WikiSession,
  params: {
    answer: string;
    now: () => string;
  },
) {
  const normalizedAnswer = params.answer.trim();
  session.state.wikiAnswerSubmissions.push({
    answer: normalizedAnswer,
    submittedAt: params.now(),
  });
  return normalizedAnswer;
}
