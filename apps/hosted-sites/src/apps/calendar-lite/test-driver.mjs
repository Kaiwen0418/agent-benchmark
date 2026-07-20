export async function complete({ session, config, context = {}, postForm, requireString }) {
  const payload = {
    title: typeof config.expectedTitle === "string"
      ? config.expectedTitle
      : typeof context.noteTitle === "string"
        ? context.noteTitle
        : "carried-value",
    date: requireString(config.expectedDate, "calendar-lite expectedDate"),
    startTime: requireString(config.expectedStartTime, "calendar-lite expectedStartTime"),
    durationMinutes: String(config.expectedDurationMinutes),
    attendeeEmail: requireString(config.expectedAttendeeEmail, "calendar-lite expectedAttendeeEmail"),
  };
  if (config.expectedSecondaryAttendeeEmail) {
    payload.secondaryAttendeeEmail = requireString(config.expectedSecondaryAttendeeEmail, "calendar-lite expectedSecondaryAttendeeEmail");
  }
  if (config.expectedResource) payload.resource = config.expectedResource;
  if (config.expectedOccurrences) payload.occurrences = String(config.expectedOccurrences);
  await postForm("/calendar/events", session.token, payload);
}
