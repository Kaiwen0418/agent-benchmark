export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString, requireObject }) {
  const articleSlug = requireString(config.targetArticleSlug, "wiki targetArticleSlug");
  const answerContract = requireObject(config.answerContract, "wiki answerContract");
  await checkedFetch(`${hostedBaseUrl}/wiki/article/${encodeURIComponent(articleSlug)}?session=${encodeURIComponent(session.token)}`);
  await postForm("/wiki/answer", session.token, {
    answer: requireString(answerContract.canonicalValue, "wiki canonicalValue"),
  });
}
