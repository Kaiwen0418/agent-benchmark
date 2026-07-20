import { aggregateStrictScore, failedEvaluator, passedEvaluator, type HostedWebScoreResult } from "@agentbench/scoring";
import { configString, configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";
import { readActorUpdate } from "./scheduling.js";

export function evaluateCalendarLite(session: HostedSessionFor<"calendar-lite">): HostedWebScoreResult {
  const config = readTaskConfig(session.metadata);
  const expectedTitle = configStringOrNull(config, "expectedTitle");
  const expectedDate = configString(config, "expectedDate");
  const expectedStartTime = configString(config, "expectedStartTime");
  const expectedDurationMinutes = Number(config.expectedDurationMinutes);
  const expectedAttendeeEmail = configString(config, "expectedAttendeeEmail").toLowerCase();
  const expectedSecondaryAttendeeEmail = configStringOrNull(config, "expectedSecondaryAttendeeEmail")?.toLowerCase();
  const expectedResource = configStringOrNull(config, "expectedResource");
  const expectedOccurrences = typeof config.expectedOccurrences === "number" ? config.expectedOccurrences : null;
  const actorUpdate = readActorUpdate(config);
  const actorUpdateApplied = actorUpdate === null || (
    session.state.calendarAvailabilityChecks.length >= actorUpdate.requiredRechecks
    && session.state.calendarAvailabilityChecks.some((check) => check.status === "updated")
  );
  // The canonical expectedStartTime is, by construction, the earliest
  // conflict-free slot for the hard availability variants, so an exact match
  // already certifies the agent booked around every existing commitment.
  const match = session.state.calendarEvents.find(
    (calendarEvent) =>
      (expectedTitle === null ? calendarEvent.title.trim().length > 0 : calendarEvent.title === expectedTitle) &&
      calendarEvent.date === expectedDate &&
      calendarEvent.startTime === expectedStartTime &&
      calendarEvent.durationMinutes === expectedDurationMinutes &&
      calendarEvent.attendeeEmail === expectedAttendeeEmail &&
      (expectedSecondaryAttendeeEmail === null ||
        calendarEvent.secondaryAttendeeEmail === expectedSecondaryAttendeeEmail) &&
      (expectedResource === null || calendarEvent.resource === expectedResource) &&
      (expectedOccurrences === null || calendarEvent.occurrences === expectedOccurrences),
  );
  return aggregateStrictScore({
    evaluators: [
      match
        ? passedEvaluator({ type: "backend_state", name: "requested calendar event exists", evidence: { eventId: match.id } })
        : failedEvaluator({
            type: "backend_state",
            name: "requested calendar event exists",
            errorMessage: "No calendar event matches the requested title, schedule, duration, and attendee(s).",
            evidence: { eventCount: session.state.calendarEvents.length },
          }),
      ...(actorUpdate === null
        ? []
        : [actorUpdateApplied
            ? passedEvaluator({
                type: "backend_state",
                name: "actor availability was rechecked",
                evidence: { recheckCount: session.state.calendarAvailabilityChecks.length },
              })
            : failedEvaluator({
                type: "backend_state",
                name: "actor availability was rechecked",
                errorMessage: "The required deterministic actor update was not observed before scheduling.",
                evidence: { recheckCount: session.state.calendarAvailabilityChecks.length },
              })]),
    ],
    passSummary: "The requested calendar event was created.",
    failSummary: "The requested calendar event was not found.",
  });
}
