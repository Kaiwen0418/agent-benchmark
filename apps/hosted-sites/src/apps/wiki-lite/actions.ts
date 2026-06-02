import type { HostedSession } from "../../runtime/types.js";

export function markArticleViewed(session: HostedSession, articleSlug: string) {
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
  session: HostedSession,
  params: {
    answer: string;
    now: () => string;
  },
) {
  const normalizedAnswer = params.answer.trim();
  session.wikiAnswerSubmissions.push({
    answer: normalizedAnswer,
    submittedAt: params.now(),
  });
  return normalizedAnswer;
}
