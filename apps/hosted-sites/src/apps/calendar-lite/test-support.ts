import { configString, configStringOrNull, type HostedAppTestSupport } from "../../runtime/test-support.js";
import { readActorUpdate } from "./scheduling.js";

export const calendarLiteTestSupport: HostedAppTestSupport<"calendar-lite"> = {
  exampleTaskConfig: {
    expectedTitle: "Architecture review",
    expectedDate: "2026-07-08",
    expectedStartTime: "14:30",
    expectedDurationMinutes: 45,
    expectedAttendeeEmail: "mira@example.com",
  },
  applyPassingState(session, config) {
    const actorUpdate = readActorUpdate(config);
    if (actorUpdate) {
      for (let index = 1; index <= actorUpdate.requiredRechecks; index += 1) {
        session.state.calendarAvailabilityChecks.push({
          id: `availability-check-test-${index}`,
          checkNumber: index,
          status: index === actorUpdate.requiredRechecks ? "updated" : "pending",
          eventId: "event-test",
          baselineRevisionCount: 0,
          createdAt: "2026-06-24T00:00:00.000Z",
        });
      }
    }
    session.state.calendarEvents.push({
      id: "event-test",
      title: configStringOrNull(config, "expectedTitle") ?? "carried-value",
      date: configString(config, "expectedDate"),
      startTime: configString(config, "expectedStartTime"),
      durationMinutes: Number(config.expectedDurationMinutes),
      attendeeEmail: configString(config, "expectedAttendeeEmail"),
      secondaryAttendeeEmail: configStringOrNull(config, "expectedSecondaryAttendeeEmail") ?? undefined,
      resource: configStringOrNull(config, "expectedResource") ?? undefined,
      occurrences: typeof config.expectedOccurrences === "number" ? config.expectedOccurrences : undefined,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:01:00.000Z",
      revisionCount: actorUpdate ? 1 : 0,
    });
  },
  breakPassingState(session) {
    const event = session.state.calendarEvents.at(-1);
    if (event) {
      event.startTime = "00:00";
    }
  },
};
