export async function complete({ session, config, postForm, requireString }) {
  await postForm("/inbox/send", session.token, {
    threadId: requireString(config.targetThreadId, "inbox targetThreadId"),
    recipients: config.expectedRecipients.join(","),
    subject: requireString(config.expectedSubject, "inbox expectedSubject"),
    body: requireString(config.expectedBody, "inbox expectedBody"),
  });
}
