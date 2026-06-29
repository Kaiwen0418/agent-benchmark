export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const threadId = requireString(config.targetThreadId, "forum targetThreadId");
  await checkedFetch(`${hostedBaseUrl}/forum/thread/${encodeURIComponent(threadId)}?session=${encodeURIComponent(session.token)}`);

  if (config.requiresReport) {
    await postForm(`/forum/thread/${encodeURIComponent(threadId)}/report`, session.token, {
      reason: requireString(config.expectedReportReason, "forum expectedReportReason"),
    });
  }

  if (config.requiresMove) {
    await postForm(`/forum/thread/${encodeURIComponent(threadId)}/move`, session.token, {
      category: requireString(config.expectedCategory, "forum expectedCategory"),
    });
  }

  if (config.requiresEditTitle) {
    await postForm(`/forum/thread/${encodeURIComponent(threadId)}/edit-title`, session.token, {
      title: requireString(config.expectedTitle, "forum expectedTitle"),
    });
  }

  if (config.requiresMarkDuplicate) {
    const canonicalThreadId =
      typeof config.canonicalThreadId === "string" && config.canonicalThreadId.length > 0
        ? config.canonicalThreadId
        : threadId;
    const duplicateThreadIds = Array.isArray(config.duplicateThreadIds) ? config.duplicateThreadIds : [];
    for (const duplicateId of duplicateThreadIds) {
      await postForm(`/forum/thread/${encodeURIComponent(duplicateId)}/mark-duplicate`, session.token, {
        duplicateOfThreadId: canonicalThreadId,
      });
    }
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
