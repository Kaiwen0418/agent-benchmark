import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { configBooleanOrFalse, readTaskConfig } from "../../runtime/question-config.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { addReplyToThread, editThreadTitle, lockThread, markThreadDuplicate, moveThread, pinThread, reportThread } from "./actions.js";
import { renderForumIndex, renderThread } from "./render.js";

export function forumCompletionAction(metadata: Record<string, unknown>) {
  return configBooleanOrFalse(readTaskConfig(metadata), "requiresPin") ? "pin" : "lock";
}

export function createForumRoutes(deps: HostedAppRouteDeps) {
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

      renderThread(
        session,
        thread,
        response,
        deps.publicBaseUrl,
        deps.defaultStartPathForApp,
        await deps.resolveSessionResult(session),
      );
      return true;
    }

    const replyMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/reply$/);
    if (request.method === "POST" && replyMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

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
      if (deps.rejectTerminalMutation(session, response)) return true;

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

      if (forumCompletionAction(session.metadata) === "lock") {
        const evalResult = deps.evaluateSession(session);
        const completed = await deps.completeSession(session, evalResult);
        if (!completed) {
          sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
          return true;
        }
      }

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const pinMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/pin$/);
    if (request.method === "POST" && pinMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const threadId = decodeURIComponent(pinMatch[1]);
      const form = await deps.readForm(request);
      const reason = form.get("reason");
      if (typeof reason !== "string" || reason.trim().length === 0) {
        deps.badRequest(response, "Pin reason is required");
        return true;
      }

      const result = pinThread(session, {
        threadId,
        reason: reason.trim(),
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.thread_pinned", threadId, actionId: result.action.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.thread_pinned",
        threadId,
        actionId: result.action.id,
      });

      if (forumCompletionAction(session.metadata) === "pin") {
        const evalResult = deps.evaluateSession(session);
        const completed = await deps.completeSession(session, evalResult);
        if (!completed) {
          sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
          return true;
        }
      }

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const reportMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/report$/);
    if (request.method === "POST" && reportMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const threadId = decodeURIComponent(reportMatch[1]);
      const form = await deps.readForm(request);
      const reason = form.get("reason");
      if (typeof reason !== "string" || reason.trim().length === 0) {
        deps.badRequest(response, "Report reason is required");
        return true;
      }

      const result = reportThread(session, {
        threadId,
        reason: reason.trim(),
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.thread_reported", threadId, actionId: result.action.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.thread_reported",
        threadId,
        actionId: result.action.id,
      });

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const moveMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/move$/);
    if (request.method === "POST" && moveMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const threadId = decodeURIComponent(moveMatch[1]);
      const form = await deps.readForm(request);
      const category = form.get("category");
      if (typeof category !== "string" || category.trim().length === 0) {
        deps.badRequest(response, "Target category is required");
        return true;
      }
      const reason = form.get("reason");

      const result = moveThread(session, {
        threadId,
        category: category.trim(),
        reason: typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "recategorized",
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.thread_moved", threadId, actionId: result.action.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.thread_moved",
        threadId,
        actionId: result.action.id,
      });

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const editTitleMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/edit-title$/);
    if (request.method === "POST" && editTitleMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const threadId = decodeURIComponent(editTitleMatch[1]);
      const form = await deps.readForm(request);
      const title = form.get("title");
      if (typeof title !== "string" || title.trim().length === 0) {
        deps.badRequest(response, "New title is required");
        return true;
      }
      const reason = form.get("reason");

      const result = editThreadTitle(session, {
        threadId,
        title: title.trim(),
        reason: typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "title cleanup",
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.thread_retitled", threadId, actionId: result.action.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.thread_retitled",
        threadId,
        actionId: result.action.id,
      });

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const markDuplicateMatch = url.pathname.match(/^\/forum\/thread\/([^/]+)\/mark-duplicate$/);
    if (request.method === "POST" && markDuplicateMatch) {
      const session = await getForumSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const threadId = decodeURIComponent(markDuplicateMatch[1]);
      const form = await deps.readForm(request);
      const duplicateOfThreadId = form.get("duplicateOfThreadId");
      if (typeof duplicateOfThreadId !== "string" || duplicateOfThreadId.trim().length === 0) {
        deps.badRequest(response, "Canonical thread id is required");
        return true;
      }
      const reason = form.get("reason");

      const result = markThreadDuplicate(session, {
        threadId,
        duplicateOfThreadId: duplicateOfThreadId.trim(),
        reason: typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "duplicate",
        makeId: deps.makeId,
      });

      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "forum.thread_marked_duplicate", threadId, actionId: result.action.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "forum.thread_marked_duplicate",
        threadId,
        actionId: result.action.id,
      });

      redirect(response, `/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
