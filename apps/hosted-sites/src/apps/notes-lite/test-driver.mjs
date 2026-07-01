export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const title = typeof config.expectedTitle === "string" ? config.expectedTitle : "carried-value";
  const body = typeof config.expectedBody === "string" ? config.expectedBody : "second-carried-value";
  const tag = requireString(config.expectedTag, "notes expectedTag");
  if (config.targetNoteId) {
    await checkedFetch(`${hostedBaseUrl}/notes/${encodeURIComponent(config.targetNoteId)}/edit?session=${encodeURIComponent(session.token)}`);
    await postForm(`/notes/${encodeURIComponent(config.targetNoteId)}/edit`, session.token, { title, body, tag });
  } else {
    await postForm("/notes/create", session.token, { title, body, tag });
  }
}
