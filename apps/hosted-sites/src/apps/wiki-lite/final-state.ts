import { configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";

export function buildWikiFinalState(session: HostedSessionFor<"wiki-lite">) {
  const taskConfig = readTaskConfig(session.metadata);
  const targetArticleSlug = configStringOrNull(taskConfig, "targetArticleSlug") ?? "agentbench-release-history";
  const secondaryArticleSlug = configStringOrNull(taskConfig, "secondaryArticleSlug");
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

  return {
    app: "wiki-lite",
    taskSlug: session.taskSlug,
    latestAnswer: session.state.wikiAnswerSubmissions.at(-1) ?? null,
    targetArticleViewed: isArticleViewed(targetArticleSlug),
    secondaryArticleViewed: secondaryArticleSlug ? isArticleViewed(secondaryArticleSlug) : null,
  };
}
