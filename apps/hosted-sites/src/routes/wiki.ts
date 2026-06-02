import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import { markArticleViewed, submitWikiAnswer } from "../apps/wiki-lite/actions.js";
import { renderWikiArticle, renderWikiIndex } from "../apps/wiki-lite/render.js";
import { redirect, sendJson } from "../runtime/http.js";
import type { HostedSession } from "../runtime/types.js";

type WikiRoutesDeps = {
  publicBaseUrl: string;
  defaultStartPathForApp: (app: string) => string;
  now: () => string;
  getSession: (url: URL, request: IncomingMessage) => Promise<HostedSession | null>;
  persistSessionSnapshot: (session: HostedSession) => Promise<void>;
  recordEvent: (session: HostedSession, payload: Record<string, unknown>) => Promise<void>;
  forwardRunEvent: (session: HostedSession, type: string, payload: Record<string, unknown>) => Promise<void>;
  completeSession: (session: HostedSession, result: HostedWebScoreResult) => Promise<HostedWebScoreResult | null>;
  evaluateSession: (session: HostedSession) => HostedWebScoreResult;
  readForm: (request: IncomingMessage) => Promise<URLSearchParams>;
  badRequest: (response: ServerResponse, message: string) => void;
  notFound: (response: ServerResponse) => void;
};

export function createWikiRoutes(deps: WikiRoutesDeps) {
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (request.method === "GET" && url.pathname === "/wiki") {
      const session = await deps.getSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderWikiIndex(session, response, url.searchParams.get("q") ?? "", deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    const wikiArticleMatch = url.pathname.match(/^\/wiki\/article\/([^/]+)$/);
    if (request.method === "GET" && wikiArticleMatch) {
      const session = await deps.getSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const articleSlug = decodeURIComponent(wikiArticleMatch[1]);
      const article = session.wikiArticles.find((candidate) => candidate.slug === articleSlug);
      if (!article) {
        deps.notFound(response);
        return true;
      }

      if (markArticleViewed(session, articleSlug)) {
        await deps.persistSessionSnapshot(session);
      }

      renderWikiArticle(session, article, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/wiki/answer") {
      const session = await deps.getSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const form = await deps.readForm(request);
      const answer = form.get("answer");
      if (typeof answer !== "string" || answer.trim().length === 0) {
        deps.badRequest(response, "Answer is required");
        return true;
      }

      const normalizedAnswer = submitWikiAnswer(session, {
        answer,
        now: deps.now,
      });
      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "wiki.answer_submitted", answer: normalizedAnswer });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "wiki.answer_submitted",
        answer: normalizedAnswer,
      });
      const result = deps.evaluateSession(session);
      const completed = await deps.completeSession(session, result);
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }

      redirect(response, `/wiki?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
