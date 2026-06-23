export async function complete({ session, config, postForm, requireString }) {
  await postForm("/notes/create", session.token, {
    title: requireString(config.expectedTitle, "notes expectedTitle"),
    body: requireString(config.expectedBody, "notes expectedBody"),
    tag: requireString(config.expectedTag, "notes expectedTag"),
  });
}
