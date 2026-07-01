import type { HostedSessionFor } from "../../runtime/types.js";

export function createCalendarEvent(
  session: HostedSessionFor<"calendar-lite">,
  input: {
    title: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    attendeeEmail: string;
    secondaryAttendeeEmail?: string;
    resource?: string;
    occurrences?: number;
    makeId: (prefix: string) => string;
    now: () => string;
  },
) {
  const title = input.title.trim();
  const attendeeEmail = input.attendeeEmail.trim().toLowerCase();
  const secondaryAttendeeEmail = input.secondaryAttendeeEmail?.trim().toLowerCase();
  if (!title) return { success: false as const, error: "Title is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { success: false as const, error: "Date is invalid" };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { success: false as const, error: "Start time is invalid" };
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    return { success: false as const, error: "Duration is invalid" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(attendeeEmail)) {
    return { success: false as const, error: "Attendee email is invalid" };
  }
  if (secondaryAttendeeEmail !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(secondaryAttendeeEmail)) {
    return { success: false as const, error: "Secondary attendee email is invalid" };
  }

  const calendarEvent = {
    id: input.makeId("event"),
    title,
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    attendeeEmail,
    secondaryAttendeeEmail,
    resource: input.resource?.trim() || undefined,
    occurrences: input.occurrences && input.occurrences > 1 ? input.occurrences : undefined,
    createdAt: input.now(),
  };
  session.state.calendarEvents.push(calendarEvent);
  return { success: true as const, calendarEvent };
}
