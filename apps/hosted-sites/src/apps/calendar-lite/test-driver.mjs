export async function complete({ session, config, context = {}, hostedBaseUrl, checkedFetch, postForm, requireString }) {
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
  if (config.actorUpdate) {
    await checkedFetch(`${hostedBaseUrl}/calendar?session=${encodeURIComponent(session.token)}`);
    await postForm("/calendar/events", session.token, {
      ...payload,
      startTime: requireString(config.actorUpdate.provisionalStartTime, "calendar-lite provisionalStartTime"),
    });
    for (let index = 0; index < config.actorUpdate.requiredRechecks; index += 1) {
      await postForm("/calendar/availability/recheck", session.token, {});
    }
    const calendar = await (
      await checkedFetch(`${hostedBaseUrl}/calendar?session=${encodeURIComponent(session.token)}`)
    ).text();
    const eventId = calendar.match(/\/calendar\/events\/([^/?"]+)\?session=/)?.[1];
    if (!eventId) throw new Error("Calendar campaign event id was not rendered.");
    await postForm(`/calendar/events/${decodeURIComponent(eventId)}`, session.token, payload);
    return;
  }
  await postForm("/calendar/events", session.token, payload);
}
