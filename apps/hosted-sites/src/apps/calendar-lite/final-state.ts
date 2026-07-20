import type { HostedSessionFor } from "../../runtime/types.js";

export function buildCalendarLiteFinalState(session: HostedSessionFor<"calendar-lite">) {
  return {
    app: "calendar-lite",
    taskSlug: session.taskSlug,
    calendarEvents: session.state.calendarEvents.map((calendarEvent) => ({
      id: calendarEvent.id,
      title: calendarEvent.title,
      date: calendarEvent.date,
      startTime: calendarEvent.startTime,
      durationMinutes: calendarEvent.durationMinutes,
      attendeeEmail: calendarEvent.attendeeEmail,
      secondaryAttendeeEmail: calendarEvent.secondaryAttendeeEmail ?? null,
      resource: calendarEvent.resource ?? null,
      occurrences: calendarEvent.occurrences ?? 1,
    })),
    ...(session.state.calendarAvailabilityChecks.length > 0
      ? {
          availabilityRecheckCount: session.state.calendarAvailabilityChecks.length,
          actorUpdateApplied: session.state.calendarAvailabilityChecks.some(
            (check) => check.status === "updated",
          ),
        }
      : {}),
  };
}
