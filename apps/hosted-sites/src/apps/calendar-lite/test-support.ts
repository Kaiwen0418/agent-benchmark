import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const calendarLiteTestSupport: HostedAppTestSupport<"calendar-lite"> = {
  exampleTaskConfig: {
    expectedTitle: "Architecture review",
    expectedDate: "2026-07-08",
    expectedStartTime: "14:30",
    expectedDurationMinutes: 45,
    expectedAttendeeEmail: "mira@example.com",
  },
  applyPassingState(session, config) {
    session.state.calendarEvents.push({
      id: "event-test",
      title: configString(config, "expectedTitle"),
      date: configString(config, "expectedDate"),
      startTime: configString(config, "expectedStartTime"),
      durationMinutes: Number(config.expectedDurationMinutes),
      attendeeEmail: configString(config, "expectedAttendeeEmail"),
      createdAt: "2026-06-24T00:00:00.000Z",
    });
  },
  breakPassingState(session) {
    session.state.calendarEvents[0]!.title = "Wrong event title";
  },
};
