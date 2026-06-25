import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { createCalendarEvent } from "./actions.js";
import { renderCalendarLite } from "./render.js";

export function createCalendarLiteRoutes(deps: HostedAppRouteDeps) {
  async function getSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "calendar-lite") ? session : null;
  }
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    const session = await getSession(url, request);
    if ((url.pathname === "/calendar" || url.pathname === "/calendar/events") && !session) {
      deps.badRequest(response, "Missing or invalid session");
      return true;
    }
    if (request.method === "GET" && url.pathname === "/calendar") {
      renderCalendarLite(session!, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/calendar/events") {
      if (deps.rejectTerminalMutation(session!, response)) return true;
      const form = await deps.readForm(request);
      const title = form.get("title");
      const date = form.get("date");
      const startTime = form.get("startTime");
      const durationMinutes = Number(form.get("durationMinutes"));
      const attendeeEmail = form.get("attendeeEmail");
      if (
        typeof title !== "string" ||
        typeof date !== "string" ||
        typeof startTime !== "string" ||
        typeof attendeeEmail !== "string"
      ) {
        deps.badRequest(response, "Title, date, start time, duration, and attendee are required");
        return true;
      }
      const created = createCalendarEvent(session!, {
        title,
        date,
        startTime,
        durationMinutes,
        attendeeEmail,
        makeId: deps.makeId,
        now: deps.now,
      });
      if (!created.success) {
        deps.badRequest(response, created.error);
        return true;
      }
      await deps.persistSessionSnapshot(session!);
      await deps.recordEvent(session!, {
        type: "task.signal",
        name: "calendar.event_created",
        eventId: created.calendarEvent.id,
      });
      await deps.forwardRunEvent(session!, "hosted.task_signal", {
        source: "hosted-sites",
        sessionId: session!.id,
        taskSlug: session!.taskSlug,
        name: "calendar.event_created",
        eventId: created.calendarEvent.id,
      });
      const completed = await deps.completeSession(session!, deps.evaluateSession(session!));
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }
      redirect(response, `/calendar?session=${encodeURIComponent(session!.token)}`);
      return true;
    }
    return false;
  }
  return { handle };
}
