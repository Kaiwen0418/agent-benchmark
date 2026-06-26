export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const threadId = requireString(config.targetThreadId, "forum targetThreadId");
  await checkedFetch(`${hostedBaseUrl}/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);

  if (config.requiresReport) {
    await postForm(`/forum/thread/${encodeURIComponent(threadId)}/report`, session.token, {
      reason: requireString(config.expectedReportReason, "forum expectedReportReason"),
    });
  }

  await postForm(`/forum/thread/${encodeURIComponent(threadId)}/reply`, session.token, {
    body: requireString(config.expectedReplyValue, "forum expectedReplyValue"),
  });

  await postForm(`/forum/thread/${encodeURIComponent(threadId)}/lock`, session.token, {
    reason: requireString(config.expectedLockReason, "forum expectedLockReason"),
  });

  if (config.requiresPin) {
    await postForm(`/forum/thread/${encodeURIComponent(threadId)}/pin`, session.token, {
      reason: requireString(config.expectedLockReason, "forum pin reason"),
    });
  }
}
