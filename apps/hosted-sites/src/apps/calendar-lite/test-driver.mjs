export async function complete({ session, config, postForm, requireString }) {
  const payload = {
    title: requireString(config.expectedTitle, "calendar-lite expectedTitle"),
    date: requireString(config.expectedDate, "calendar-lite expectedDate"),
    startTime: requireString(config.expectedStartTime, "calendar-lite expectedStartTime"),
    durationMinutes: String(config.expectedDurationMinutes),
    attendeeEmail: requireString(config.expectedAttendeeEmail, "calendar-lite expectedAttendeeEmail"),
  };
  if (config.expectedSecondaryAttendeeEmail) {
    payload.secondaryAttendeeEmail = requireString(config.expectedSecondaryAttendeeEmail, "calendar-lite expectedSecondaryAttendeeEmail");
  }
  await postForm("/calendar/events", session.token, payload);
}
