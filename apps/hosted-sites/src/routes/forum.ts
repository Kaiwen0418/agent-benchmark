import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import { addReplyToThread, lockThread } from "../apps/forum-lite/actions.js";
import { renderForumIndex, renderThread } from "../apps/forum-lite/render.js";
import { redirect, sendJson } from "../runtime/http.js";
import { isHostedSessionForApp, type HostedSession } from "../runtime/types.js";

type ForumRoutesDeps = {
  publicBaseUrl: string;
  defaultStartPathForApp: (app: string) => string;
  makeId: (prefix: string) => string;
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

export function createForumRoutes(deps: ForumRoutesDeps) {
  async function getForumSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "forum-lite") ? session : null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (request.method === "GET" && url.pathname === "/forum") {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderForumIndex(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    const threadMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)$/);
    if (request.method === "GET" && threadMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const threadId = decodeURIComponent(threadMatch[1]);
      const thread = session.state.threads.find((candidate) => candidate.id === threadId);
      if (!thread) {
        deps.notFound(response);
        return true;
      }

      renderThread(session, thread, response, deps.publicBaseUrl, deps.defaultStartPathForApp, deps.evaluateSession);
      return true;
    }

    const replyMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/reply$/);
    if (request.method === "POST" && replyMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const threadId = decodeURIComponent(replyMatch[1]);
      const form = await deps.readForm(request);
      const body = form.get("body");
      if (typeof body !== "string" || body.trim().length === 0) {
        deps.badRequest(response, "Reply body is required");
        return true;
      }

      const result = addReplyToThread(session, {
        threadId,
        author: "agent",
        body: body.trim(),
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.reply_posted", threadId, postId: result.post.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.reply_posted",
        threadId,
        postId: result.post.id,
      });

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const lockMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/lock$/);
    if (request.method === "POST" && lockMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const threadId = decodeURIComponent(lockMatch[1]);
      const form = await deps.readForm(request);
      const reason = form.get("reason");
      if (typeof reason !== "string" || reason.trim().length === 0) {
        deps.badRequest(response, "Lock reason is required");
        return true;
      }

      const result = lockThread(session, {
        threadId,
        reason: reason.trim(),
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.thread_locked", threadId, actionId: result.action.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.thread_locked",
        threadId,
        actionId: result.action.id,
      });

      const evalResult = deps.evaluateSession(session);
      const completed = await deps.completeSession(session, evalResult);
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
