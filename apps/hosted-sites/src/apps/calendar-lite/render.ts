import type { ServerResponse } from "node:http";
import { readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";
import { escapeHtml, layout, sendHtml } from "../../templates.js";
import { readActorUpdate, visibleBusyEvents } from "./scheduling.js";

export function renderCalendarLite(
  session: HostedSessionFor<"calendar-lite">,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  const eventsHtml = session.state.calendarEvents.length
    ? session.state.calendarEvents.map((calendarEvent) => `
      <article class="card">
        <h2>${escapeHtml(calendarEvent.title)}</h2>
        <p>${escapeHtml(calendarEvent.date)} at ${escapeHtml(calendarEvent.startTime)} for ${calendarEvent.durationMinutes} minutes</p>
        <p class="muted">${escapeHtml(calendarEvent.attendeeEmail)}${calendarEvent.secondaryAttendeeEmail ? `, ${escapeHtml(calendarEvent.secondaryAttendeeEmail)}` : ""}</p>
        ${calendarEvent.resource ? `<p class="muted">Resource: ${escapeHtml(calendarEvent.resource)}</p>` : ""}
        ${calendarEvent.occurrences ? `<p class="muted">Weekly occurrences: ${calendarEvent.occurrences}</p>` : ""}
      </article>`).join("")
    : '<article class="card"><p class="muted">No events scheduled.</p></article>';

  // Hard variants surface read-only existing commitments the agent must avoid.
  let busyEvents: ReturnType<typeof visibleBusyEvents> = [];
  let actorUpdate: ReturnType<typeof readActorUpdate> = null;
  try {
    const config = readTaskConfig(session.metadata);
    actorUpdate = readActorUpdate(config);
    busyEvents = visibleBusyEvents(config, session.state.calendarAvailabilityChecks.length);
  } catch {
    busyEvents = [];
  }
  const latestCheck = session.state.calendarAvailabilityChecks.at(-1);
  const coordinationHtml = actorUpdate
    ? `<section class="panel" style="margin-top:16px;">
      <h2>Actor availability update</h2>
      <p class="muted">${escapeHtml(
        latestCheck?.status === "updated"
          ? actorUpdate.appliedMessage
          : latestCheck?.status === "pending"
            ? actorUpdate.pendingMessage
            : "An external approval is pending. Recheck availability before scheduling.",
      )}</p>
      <p class="muted">Rechecks completed: ${session.state.calendarAvailabilityChecks.length}</p>
      <form method="post" action="/calendar/availability/recheck?session=${encodeURIComponent(session.token)}">
        <button type="submit">Recheck availability</button>
      </form>
    </section>`
    : "";
  const commitmentsHtml = busyEvents.length
    ? `<section class="panel" style="margin-top:16px;">
      <h2>Existing commitments</h2>
      <p class="muted">These slots are already booked and cannot be double-booked for the listed attendees.</p>
      ${busyEvents
        .map((busy) => `
        <article class="card">
          <h3>${escapeHtml(busy.title)}</h3>
          <p>${escapeHtml(busy.date)} at ${escapeHtml(busy.startTime)} for ${busy.durationMinutes} minutes</p>
          <p class="muted">${escapeHtml(busy.attendeeEmail)}${busy.secondaryAttendeeEmail ? `, ${escapeHtml(busy.secondaryAttendeeEmail)}` : ""}</p>
        </article>`)
        .join("")}
    </section>`
    : "";

  sendHtml(response, 200, layout({
    title: "AgentBench Calendar",
    session,
    publicBaseUrl,
    defaultStartPathForApp,
    body: `<section class="panel">
      <h2>Create event</h2>
      <form method="post" action="/calendar/events?session=${encodeURIComponent(session.token)}">
        <label>Title <input name="title" style="display:block;width:100%;margin-top:8px;padding:8px;" /></label>
        <div class="grid" style="margin-top:12px;">
          <label>Date <input type="date" name="date" style="display:block;width:100%;margin-top:8px;padding:8px;" /></label>
          <label>Start time <input type="time" name="startTime" style="display:block;width:100%;margin-top:8px;padding:8px;" /></label>
          <label>Duration
            <select name="durationMinutes" style="display:block;width:100%;margin-top:8px;">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>
        </div>
        <label style="display:block;margin-top:12px;">Attendee email <input type="email" name="attendeeEmail" style="display:block;width:100%;margin-top:8px;padding:8px;" /></label>
        <label style="display:block;margin-top:12px;">Secondary attendee email <input type="email" name="secondaryAttendeeEmail" placeholder="Optional" style="display:block;width:100%;margin-top:8px;padding:8px;" /></label>
        <label style="display:block;margin-top:12px;">Resource <input name="resource" placeholder="Optional room or resource" /></label>
        <label style="display:block;margin-top:12px;">Weekly occurrences <input type="number" min="1" name="occurrences" value="1" /></label>
        <button type="submit" style="margin-top:12px;">Create event</button>
      </form>
    </section>
    ${coordinationHtml}
    ${commitmentsHtml}
    <section class="grid" style="margin-top:16px;">${eventsHtml}</section>`,
  }));
}
