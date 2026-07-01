export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const title = requireString(config.expectedTitle, "notes expectedTitle");
  const body = requireString(config.expectedBody, "notes expectedBody");
  const tag = requireString(config.expectedTag, "notes expectedTag");
  if (config.targetNoteId) {
    await checkedFetch(`${hostedBaseUrl}/notes/${encodeURIComponent(config.targetNoteId)}/edit?session=${encodeURIComponent(session.token)}`);
    await postForm(`/notes/${encodeURIComponent(config.targetNoteId)}/edit`, session.token, { title, body, tag });
  } else {
    await postForm("/notes/create", session.token, { title, body, tag });
  }
}
