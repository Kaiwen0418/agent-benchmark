export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const threadId = requireString(config.targetThreadId, "forum targetThreadId");
  await checkedFetch(`${hostedBaseUrl}/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);
  await postForm(`/forum/thread/${encodeURIComponent(threadId)}/reply`, session.token, {
    body: requireString(config.expectedReplyValue, "forum expectedReplyValue"),
  });
  await postForm(`/forum/thread/${encodeURIComponent(threadId)}/lock`, session.token, {
    reason: requireString(config.expectedLockReason, "forum expectedLockReason"),
  });
}
