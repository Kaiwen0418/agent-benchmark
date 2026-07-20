export async function complete({ session, config, context = {}, hostedBaseUrl, checkedFetch, postForm, requireString, requireObject }) {
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
  const answer = requireString(answerContract.canonicalValue, "wiki canonicalValue");
  await postForm("/wiki/answer", session.token, { answer });
  if (["wiki-release-answer-hard", "capability-wiki-release-research"].includes(session.taskSlug)) {
    context.wikiReleaseAnswer = answer;
  }
  if (["wiki-policy-answer-hard", "capability-wiki-policy-research"].includes(session.taskSlug)) {
    context.wikiPolicyAnswer = answer;
  }
}
