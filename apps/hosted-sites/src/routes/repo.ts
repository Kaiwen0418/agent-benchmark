import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import { createMergeRequest, updateFileContent } from "../apps/repo-lite/actions.js";
import { renderFileEdit, renderMRDetail, renderNewMR, renderRepoIndex } from "../apps/repo-lite/render.js";
import { redirect, sendJson } from "../runtime/http.js";
import { isHostedSessionForApp, type HostedSession } from "../runtime/types.js";

type RepoRoutesDeps = {
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

export function createRepoRoutes(deps: RepoRoutesDeps) {
  async function getRepoSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "repo-lite") ? session : null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (request.method === "GET" && url.pathname === "/repo") {
      const session = await getRepoSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderRepoIndex(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    const fileEditMatch = url.pathname.match(/^\/repo\/file\/([^/]+)\/edit$/);
    if (request.method === "GET" && fileEditMatch) {
      const session = await getRepoSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const filePath = decodeURIComponent(fileEditMatch[1]);
      const file = session.state.files.find((candidate) => candidate.path === filePath);
      if (!file) {
        deps.notFound(response);
        return true;
      }

      renderFileEdit(session, file, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    if (request.method === "POST" && fileEditMatch) {
      const session = await getRepoSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const filePath = decodeURIComponent(fileEditMatch[1]);
      const form = await deps.readForm(request);
      const content = form.get("content");
      if (typeof content !== "string") {
        deps.badRequest(response, "Content is required");
        return true;
      }

      const result = updateFileContent(session, filePath, content);
      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "repo.file_edited", path: filePath });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "repo.file_edited",
        path: filePath,
      });

      redirect(response, `/repo?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    if (request.method === "GET" && url.pathname === "/repo/mr/new") {
      const session = await getRepoSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderNewMR(session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/repo/mr/new") {
      const session = await getRepoSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const form = await deps.readForm(request);
      const title = form.get("title");
      const targetBranch = form.get("targetBranch");
      if (typeof title !== "string" || title.trim().length === 0) {
        deps.badRequest(response, "Title is required");
        return true;
      }
      if (typeof targetBranch !== "string" || targetBranch.trim().length === 0) {
        deps.badRequest(response, "Target branch is required");
        return true;
      }

      const result = createMergeRequest(session, {
        title: title.trim(),
        targetBranch: targetBranch.trim(),
        makeId: deps.makeId,
      });

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "repo.mr_created", mrId: result.mr.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "repo.mr_created",
        mrId: result.mr.id,
      });

      const evalResult = deps.evaluateSession(session);
      const completed = await deps.completeSession(session, evalResult);
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }

      redirect(response, `/repo/mr/${encodeURIComponent(result.mr.id)}?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    const mrMatch = url.pathname.match(/^\/repo\/mr\/([^/]+)$/);
    if (request.method === "GET" && mrMatch) {
      const session = await getRepoSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const mrId = decodeURIComponent(mrMatch[1]);
      const mr = session.state.mergeRequests.find((candidate) => candidate.id === mrId);
      if (!mr) {
        deps.notFound(response);
        return true;
      }

      renderMRDetail(session, mr, response, deps.publicBaseUrl, deps.defaultStartPathForApp, deps.evaluateSession);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
