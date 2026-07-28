export async function complete({ session, config, context = {}, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const title = typeof config.expectedTitle === "string"
    ? config.expectedTitle
    : typeof context.wikiReleaseAnswer === "string"
      ? context.wikiReleaseAnswer
      : "carried-value";
  const body = typeof config.expectedBody === "string"
    ? config.expectedBody
    : typeof context.wikiPolicyAnswer === "string"
      ? context.wikiPolicyAnswer
      : "second-carried-value";
  if (Array.isArray(config.expectedNotes)) {
    for (const note of config.expectedNotes) {
      await postForm("/notes/create", session.token, {
        title: requireString(note.title, "notes set title"),
        body: requireString(note.body, "notes set body"),
        tag: requireString(note.tag, "notes set tag"),
      });
    }
    await postForm("/notes/create", session.token, {
      title,
      body,
      tag: requireString(config.expectedTag, "notes carry tag"),
    });
    context.noteTitle = title;
    return;
  }
  const tag = requireString(config.expectedTag, "notes expectedTag");
  if (config.targetNoteId) {
    await checkedFetch(`${hostedBaseUrl}/notes/${encodeURIComponent(config.targetNoteId)}/edit?session=${encodeURIComponent(session.token)}`);
    await postForm(`/notes/${encodeURIComponent(config.targetNoteId)}/edit`, session.token, { title, body, tag });
  } else {
    await postForm("/notes/create", session.token, { title, body, tag });
  }
  context.noteTitle = title;
}
