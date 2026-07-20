import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { readTaskConfig } from "../../runtime/question-config.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { createCalendarEvent, recheckCalendarAvailability, updateCalendarEvent } from "./actions.js";
import { renderCalendarLite } from "./render.js";
import { readActorUpdate } from "./scheduling.js";

export function createCalendarLiteRoutes(deps: HostedAppRouteDeps) {
  async function getSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "calendar-lite") ? session : null;
  }
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    const session = await getSession(url, request);
    const updateEventMatch = url.pathname.match(/^\/calendar\/events\/([^/]+)$/);
    if ((url.pathname === "/calendar" || url.pathname === "/calendar/events" || url.pathname === "/calendar/availability/recheck" || updateEventMatch) && !session) {
      deps.badRequest(response, "Missing or invalid session");
      return true;
    }
    if (request.method === "GET" && url.pathname === "/calendar") {
      renderCalendarLite(session!, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/calendar/availability/recheck") {
      if (deps.rejectTerminalMutation(session!, response)) return true;
      const checked = recheckCalendarAvailability(
        session!,
        readTaskConfig(session!.metadata),
        { makeId: deps.makeId, now: deps.now },
      );
      if (!checked.success) {
        deps.badRequest(response, checked.error);
        return true;
      }
      await deps.persistSessionSnapshot(session!);
      await deps.recordEvent(session!, {
        type: "task.signal",
        name: "calendar.availability_rechecked",
        checkNumber: checked.check.checkNumber,
        status: checked.check.status,
      });
      redirect(response, `/calendar?session=${encodeURIComponent(session!.token)}`);
      return true;
    }
    if (request.method === "POST" && url.pathname === "/calendar/events") {
      if (deps.rejectTerminalMutation(session!, response)) return true;
      const actorUpdate = readActorUpdate(readTaskConfig(session!.metadata));
      if (actorUpdate && session!.state.calendarEvents.length > 0) {
        deps.badRequest(response, "Update the existing tentative event instead of creating a replacement.");
        return true;
      }
      const form = await deps.readForm(request);
      const title = form.get("title");
      const date = form.get("date");
      const startTime = form.get("startTime");
      const durationMinutes = Number(form.get("durationMinutes"));
      const attendeeEmail = form.get("attendeeEmail");
      const secondaryAttendeeEmail = form.get("secondaryAttendeeEmail");
      const resource = form.get("resource");
      const occurrences = Number(form.get("occurrences") || 1);
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
        secondaryAttendeeEmail: typeof secondaryAttendeeEmail === "string" ? secondaryAttendeeEmail : undefined,
        resource: typeof resource === "string" ? resource : undefined,
        occurrences,
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
      if (actorUpdate) {
        redirect(response, `/calendar?session=${encodeURIComponent(session!.token)}`);
        return true;
      }
      const completed = await deps.completeSession(session!, deps.evaluateSession(session!));
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }
      redirect(response, `/calendar?session=${encodeURIComponent(session!.token)}`);
      return true;
    }
    if (request.method === "POST" && updateEventMatch) {
      if (deps.rejectTerminalMutation(session!, response)) return true;
      const form = await deps.readForm(request);
      const title = form.get("title");
      const date = form.get("date");
      const startTime = form.get("startTime");
      const durationMinutes = Number(form.get("durationMinutes"));
      const attendeeEmail = form.get("attendeeEmail");
      const secondaryAttendeeEmail = form.get("secondaryAttendeeEmail");
      const resource = form.get("resource");
      const occurrences = Number(form.get("occurrences") || 1);
      if (typeof title !== "string" || typeof date !== "string" || typeof startTime !== "string" || typeof attendeeEmail !== "string") {
        deps.badRequest(response, "Title, date, start time, duration, and attendee are required");
        return true;
      }
      const updated = updateCalendarEvent(session!, {
        eventId: decodeURIComponent(updateEventMatch[1]!),
        title,
        date,
        startTime,
        durationMinutes,
        attendeeEmail,
        secondaryAttendeeEmail: typeof secondaryAttendeeEmail === "string" ? secondaryAttendeeEmail : undefined,
        resource: typeof resource === "string" ? resource : undefined,
        occurrences,
        now: deps.now,
      });
      if (!updated.success) {
        deps.badRequest(response, updated.error);
        return true;
      }
      await deps.persistSessionSnapshot(session!);
      await deps.recordEvent(session!, {
        type: "task.signal",
        name: "calendar.event_revised",
        eventId: updated.calendarEvent.id,
        revisionCount: updated.calendarEvent.revisionCount,
      });
      const result = deps.evaluateSession(session!);
      if (result.status !== "passed") {
        redirect(response, `/calendar?session=${encodeURIComponent(session!.token)}`);
        return true;
      }
      const completed = await deps.completeSession(session!, result);
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
