export async function complete({ session, config, postForm, requireString }) {
  await postForm("/calendar/events", session.token, {
    title: requireString(config.expectedTitle, "calendar-lite expectedTitle"),
    date: requireString(config.expectedDate, "calendar-lite expectedDate"),
    startTime: requireString(config.expectedStartTime, "calendar-lite expectedStartTime"),
    durationMinutes: String(config.expectedDurationMinutes),
    attendeeEmail: requireString(config.expectedAttendeeEmail, "calendar-lite expectedAttendeeEmail"),
  });
}
