// Shared helpers for hard calendar-lite variants. Pre-existing commitments are
// read-only scheduling context surfaced from the generated task config; they are
// never the evaluator answer themselves.
export type BusyEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  attendeeEmail: string;
  secondaryAttendeeEmail?: string;
};

export type ActorUpdate = {
  requiredRechecks: number;
  pendingMessage: string;
  appliedMessage: string;
  busyEvent: BusyEvent;
};

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

export function toClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isBusyEvent(value: unknown): value is BusyEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.date === "string" &&
    typeof record.startTime === "string" &&
    typeof record.durationMinutes === "number" &&
    typeof record.attendeeEmail === "string" &&
    (record.secondaryAttendeeEmail === undefined || typeof record.secondaryAttendeeEmail === "string")
  );
}

export function readBusyEvents(config: Record<string, unknown>): BusyEvent[] {
  const value = config.seedBusyEvents;
  if (!Array.isArray(value)) return [];
  return value.filter(isBusyEvent).map((event) => ({
    ...event,
    attendeeEmail: event.attendeeEmail.toLowerCase(),
    secondaryAttendeeEmail: event.secondaryAttendeeEmail?.toLowerCase(),
  }));
}

export function readActorUpdate(config: Record<string, unknown>): ActorUpdate | null {
  const value = config.actorUpdate;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.requiredRechecks !== "number"
    || !Number.isInteger(record.requiredRechecks)
    || record.requiredRechecks < 2
    || typeof record.pendingMessage !== "string"
    || record.pendingMessage.length === 0
    || typeof record.appliedMessage !== "string"
    || record.appliedMessage.length === 0
    || !isBusyEvent(record.busyEvent)
  ) {
    return null;
  }
  return {
    requiredRechecks: record.requiredRechecks,
    pendingMessage: record.pendingMessage,
    appliedMessage: record.appliedMessage,
    busyEvent: {
      ...record.busyEvent,
      attendeeEmail: record.busyEvent.attendeeEmail.toLowerCase(),
      secondaryAttendeeEmail: record.busyEvent.secondaryAttendeeEmail?.toLowerCase(),
    },
  };
}

export function visibleBusyEvents(
  config: Record<string, unknown>,
  availabilityCheckCount: number,
): BusyEvent[] {
  const events = readBusyEvents(config);
  const actorUpdate = readActorUpdate(config);
  return actorUpdate && availabilityCheckCount >= actorUpdate.requiredRechecks
    ? [...events, actorUpdate.busyEvent]
    : events;
}

// Compute the earliest start (to the minute) on `date` at which a meeting of
// `durationMinutes` for `attendees` fits inside [windowStart, windowEnd) without
// overlapping any commitment that shares an attendee. Returns null when no slot
// fits. Used by tests to independently certify each variant's canonical answer.
export function computeEarliestFreeSlot(params: {
  date: string;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  attendees: string[];
  busyEvents: BusyEvent[];
}): string | null {
  const attendees = new Set(params.attendees.map((email) => email.toLowerCase()));
  const windowStart = toMinutes(params.windowStart);
  const windowEnd = toMinutes(params.windowEnd);
  const relevant = params.busyEvents
    .filter((busy) => busy.date === params.date)
    .filter((busy) =>
      [busy.attendeeEmail, busy.secondaryAttendeeEmail]
        .filter((email): email is string => typeof email === "string")
        .some((email) => attendees.has(email)),
    )
    .map((busy) => {
      const start = toMinutes(busy.startTime);
      return { start, end: start + busy.durationMinutes };
    });

  for (let start = windowStart; start + params.durationMinutes <= windowEnd; start += 1) {
    const end = start + params.durationMinutes;
    const conflict = relevant.some((busy) => start < busy.end && busy.start < end);
    if (!conflict) return toClock(start);
  }
  return null;
}
