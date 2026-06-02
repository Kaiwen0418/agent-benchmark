import type { HostedSession } from "../../runtime/types.js";

export function buildWikiFinalState(session: HostedSession) {
  const viewedArticleSlugs = Array.isArray(session.metadata.viewedArticleSlugs)
    ? session.metadata.viewedArticleSlugs.filter((value): value is string => typeof value === "string")
    : [];
  return {
    app: "wiki-lite",
    taskSlug: session.taskSlug,
    latestAnswer: session.wikiAnswerSubmissions.at(-1) ?? null,
    viewedReleaseHistory:
      session.events.some(
        (event) =>
          event.type === "page.load" &&
          typeof event.url === "string" &&
          String(event.url).includes("/wiki/article/agentbench-release-history"),
      ) || viewedArticleSlugs.includes("agentbench-release-history"),
  };
}
