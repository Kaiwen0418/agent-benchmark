import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateCalendarLite } from "./evaluate.js";
import { buildCalendarLiteFinalState } from "./final-state.js";
import { createCalendarLiteRoutes } from "./routes.js";
import { getCalendarLiteDefaultGoal, getCalendarLiteStartPath } from "./seed.js";
import type { CalendarAvailabilityCheck, CalendarEvent } from "./types.js";

function isCalendarEvent(value: unknown): value is CalendarEvent {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.date === "string" &&
    typeof value.startTime === "string" &&
    typeof value.durationMinutes === "number" &&
    typeof value.attendeeEmail === "string" &&
    (value.secondaryAttendeeEmail === undefined || typeof value.secondaryAttendeeEmail === "string") &&
    (value.resource === undefined || typeof value.resource === "string") &&
    (value.occurrences === undefined || typeof value.occurrences === "number") &&
    typeof value.createdAt === "string"
  );
}

function isCalendarAvailabilityCheck(value: unknown): value is CalendarAvailabilityCheck {
  return isStateRecord(value)
    && typeof value.id === "string"
    && typeof value.checkNumber === "number"
    && Number.isInteger(value.checkNumber)
    && (value.status === "pending" || value.status === "updated")
    && typeof value.createdAt === "string";
}

export const calendarLiteDefinition: HostedAppDefinition<"calendar-lite"> = {
  id: "calendar-lite",
  stateKeys: ["calendarEvents", "calendarAvailabilityChecks"],
  getDefaultStartPath: getCalendarLiteStartPath,
  getDefaultGoal: getCalendarLiteDefaultGoal,
  buildInitialSessionState: () => ({ calendarEvents: [], calendarAvailabilityChecks: [] }),
  hydratePersistedState: (value) => ({
    calendarEvents: readStateArray(value, "calendarEvents", isCalendarEvent),
    calendarAvailabilityChecks: readStateArray(
      value,
      "calendarAvailabilityChecks",
      isCalendarAvailabilityCheck,
    ),
  }),
  buildFinalState: buildCalendarLiteFinalState,
  evaluate: evaluateCalendarLite,
  createRoutes: (deps) => [createCalendarLiteRoutes(deps).handle],
};
