export async function complete({ session, config, context = {}, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const amendment = config.policyAmendment;
  if (amendment) {
    const body = typeof config.expectedBody === "string"
      ? config.expectedBody
      : requireString(context.wikiPolicyAnswer, "carried inbox policy body");
    await postForm("/inbox/drafts", session.token, {
      threadId: requireString(config.targetThreadId, "inbox targetThreadId"),
      recipients: amendment.provisionalRecipients.join(","),
      subject: requireString(amendment.provisionalSubject, "inbox provisionalSubject"),
      body,
    });
    for (let index = 0; index < amendment.requiredRechecks; index += 1) {
      await postForm("/inbox/policy/recheck", session.token, {});
    }
    const compose = await (
      await checkedFetch(`${hostedBaseUrl}/inbox/compose?session=${encodeURIComponent(session.token)}`)
    ).text();
    const draftId = compose.match(/\/inbox\/drafts\/([^/?"]+)\?session=/)?.[1];
    if (!draftId) throw new Error("Inbox campaign draft id was not rendered.");
    await postForm(`/inbox/drafts/${decodeURIComponent(draftId)}`, session.token, {
      recipients: config.expectedRecipients.join(","),
      subject: requireString(config.expectedSubject, "inbox expectedSubject"),
      body,
    });
    await postForm(`/inbox/drafts/${decodeURIComponent(draftId)}/send`, session.token, {});
    return;
  }
  await postForm("/inbox/send", session.token, {
    threadId: requireString(config.targetThreadId, "inbox targetThreadId"),
    recipients: config.expectedRecipients.join(","),
    subject: requireString(config.expectedSubject, "inbox expectedSubject"),
    body: requireString(config.expectedBody, "inbox expectedBody"),
  });
}
