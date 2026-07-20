import type { HostedSessionFor } from "../../runtime/types.js";
import { readActorUpdate } from "./scheduling.js";
import type { CalendarEvent } from "./types.js";

type CalendarEventInput = {
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  attendeeEmail: string;
  secondaryAttendeeEmail?: string;
  resource?: string;
  occurrences?: number;
};

function normalizeCalendarEvent(input: CalendarEventInput) {
  const title = input.title.trim();
  const attendeeEmail = input.attendeeEmail.trim().toLowerCase();
  const normalizedSecondaryAttendeeEmail = input.secondaryAttendeeEmail?.trim().toLowerCase();
  const secondaryAttendeeEmail = normalizedSecondaryAttendeeEmail || undefined;
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
  return {
    success: true as const,
    value: {
      title,
      date: input.date,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      attendeeEmail,
      secondaryAttendeeEmail,
      resource: input.resource?.trim() || undefined,
      occurrences: input.occurrences && input.occurrences > 1 ? input.occurrences : undefined,
    },
  };
}

export function recheckCalendarAvailability(
  session: HostedSessionFor<"calendar-lite">,
  taskConfig: Record<string, unknown>,
  deps: { makeId: (prefix: string) => string; now: () => string },
) {
  const actorUpdate = readActorUpdate(taskConfig);
  if (!actorUpdate) {
    return { success: false as const, error: "This task has no pending actor update." };
  }
  if (session.state.calendarAvailabilityChecks.some((check) => check.status === "updated")) {
    return { success: false as const, error: "The actor update has already been applied." };
  }
  const trackedEventId = session.state.calendarAvailabilityChecks[0]?.eventId;
  const provisionalEvent = trackedEventId
    ? session.state.calendarEvents.find((event) => event.id === trackedEventId)
    : session.state.calendarEvents.find((event) =>
        event.date === taskConfig.expectedDate
        && event.startTime === actorUpdate.provisionalStartTime
        && event.durationMinutes === taskConfig.expectedDurationMinutes
        && event.attendeeEmail === String(taskConfig.expectedAttendeeEmail).toLowerCase()
        && (typeof taskConfig.expectedSecondaryAttendeeEmail !== "string"
          ? event.secondaryAttendeeEmail === undefined
          : event.secondaryAttendeeEmail === taskConfig.expectedSecondaryAttendeeEmail.toLowerCase()),
      );
  if (
    !provisionalEvent
    || provisionalEvent.startTime !== actorUpdate.provisionalStartTime
    || (session.state.calendarAvailabilityChecks[0] !== undefined
      && provisionalEvent.revisionCount !== session.state.calendarAvailabilityChecks[0].baselineRevisionCount)
  ) {
    return {
      success: false as const,
      error: trackedEventId
        ? "Keep the tracked tentative event unchanged until the actor update appears."
        : "Create the tentative event at the current earliest free time before rechecking.",
    };
  }
  const checkNumber = session.state.calendarAvailabilityChecks.length + 1;
  const check = {
    id: deps.makeId("availability-check"),
    checkNumber,
    status: checkNumber >= actorUpdate.requiredRechecks
      ? "updated" as const
      : "pending" as const,
    eventId: provisionalEvent.id,
    baselineRevisionCount: session.state.calendarAvailabilityChecks[0]?.baselineRevisionCount ?? provisionalEvent.revisionCount,
    createdAt: deps.now(),
  };
  session.state.calendarAvailabilityChecks.push(check);
  return {
    success: true as const,
    check,
    message: check.status === "updated"
      ? actorUpdate.appliedMessage
      : actorUpdate.pendingMessage,
  };
}

export function createCalendarEvent(
  session: HostedSessionFor<"calendar-lite">,
  input: CalendarEventInput & {
    makeId: (prefix: string) => string;
    now: () => string;
  },
) {
  const normalized = normalizeCalendarEvent(input);
  if (!normalized.success) return normalized;
  const now = input.now();
  const calendarEvent: CalendarEvent = {
    id: input.makeId("event"),
    ...normalized.value,
    createdAt: now,
    updatedAt: now,
    revisionCount: 0,
  };
  session.state.calendarEvents.push(calendarEvent);
  return { success: true as const, calendarEvent };
}

export function updateCalendarEvent(
  session: HostedSessionFor<"calendar-lite">,
  input: CalendarEventInput & { eventId: string; now: () => string },
) {
  const calendarEvent = session.state.calendarEvents.find((event) => event.id === input.eventId);
  if (!calendarEvent) return { success: false as const, error: "Event not found" };
  const normalized = normalizeCalendarEvent(input);
  if (!normalized.success) return normalized;
  Object.assign(calendarEvent, normalized.value, {
    updatedAt: input.now(),
    revisionCount: calendarEvent.revisionCount + 1,
  });
  return { success: true as const, calendarEvent };
}
