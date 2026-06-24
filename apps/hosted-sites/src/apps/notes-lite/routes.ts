import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { createNote } from "./actions.js";
import { renderNotesIndex } from "./render.js";

export function createNotesRoutes(deps: HostedAppRouteDeps) {
  async function getNotesSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "notes-lite") ? session : null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (request.method === "GET" && url.pathname === "/notes") {
      const session = await getNotesSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      renderNotesIndex(
        session,
        response,
        deps.publicBaseUrl,
        deps.defaultStartPathForApp,
        await deps.resolveSessionResult(session),
      );
      return true;
    }

    if (request.method === "POST" && url.pathname === "/notes/create") {
      const session = await getNotesSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }
      if (deps.rejectTerminalMutation(session, response)) return true;

      const form = await deps.readForm(request);
      const title = form.get("title");
      const body = form.get("body");
      const tag = form.get("tag");
      if (typeof title !== "string" || typeof body !== "string" || typeof tag !== "string") {
        deps.badRequest(response, "Title, body, and tag are required");
        return true;
      }

      const result = createNote(session, {
        title,
        body,
        tag,
        now: deps.now,
        makeId: deps.makeId,
      });
      if (!result.success) {
        deps.badRequest(response, result.error);
        return true;
      }

      await deps.persistSessionSnapshot(session);
      await deps.recordEvent(session, { type: "task.signal", name: "notes.note_created", noteId: result.note.id });
      await deps.forwardRunEvent(session, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        name: "notes.note_created",
        noteId: result.note.id,
      });

      const evalResult = deps.evaluateSession(session);
      const completed = await deps.completeSession(session, evalResult);
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }

      redirect(response, `/notes?session=${encodeURIComponent(session.token)}`);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
