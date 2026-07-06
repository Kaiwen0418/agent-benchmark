export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString, requireObject }) {
  const articleSlug = requireString(config.targetArticleSlug, "wiki targetArticleSlug");
  const answerContract = requireObject(config.answerContract, "wiki answerContract");
  const secondaryArticleSlug = config.secondaryArticleSlug;
  if (secondaryArticleSlug) {
    await checkedFetch(`${hostedBaseUrl}/wiki/article/${encodeURIComponent(secondaryArticleSlug)}?session=${encodeURIComponent(session.token)}`);
  }
  if (Array.isArray(config.requiredArticleSlugs)) {
    for (const requiredSlug of config.requiredArticleSlugs) {
      await checkedFetch(`${hostedBaseUrl}/wiki/article/${encodeURIComponent(requiredSlug)}?session=${encodeURIComponent(session.token)}`);
    }
  }
  await checkedFetch(`${hostedBaseUrl}/wiki/article/${encodeURIComponent(articleSlug)}?session=${encodeURIComponent(session.token)}`);
  await postForm("/wiki/answer", session.token, {
    answer: requireString(answerContract.canonicalValue, "wiki canonicalValue"),
  });
}
