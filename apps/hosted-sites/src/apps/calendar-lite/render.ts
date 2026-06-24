import type { ServerResponse } from "node:http";
import type { HostedSessionFor } from "../../runtime/types.js";
import { escapeHtml, layout, sendHtml } from "../../templates.js";

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
        <p class="muted">${escapeHtml(calendarEvent.attendeeEmail)}</p>
      </article>`).join("")
    : '<article class="card"><p class="muted">No events scheduled.</p></article>';

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
        <button type="submit" style="margin-top:12px;">Create event</button>
      </form>
    </section>
    <section class="grid" style="margin-top:16px;">${eventsHtml}</section>`,
  }));
}
