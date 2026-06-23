export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const filePath = requireString(config.filePath, "repo filePath");
  const expectedText = requireString(config.expectedText, "repo expectedText");
  const content = [
    "# Demo Project",
    "",
    "## Install",
    "",
    `Run \`${expectedText}\` to install dependencies.`,
    "",
    "## Usage",
    "",
    "Start the dev server with `npm run dev`.",
    "",
  ].join("\n");
  await checkedFetch(`${hostedBaseUrl}/repo/file/${encodeURIComponent(filePath)}/edit?session=${encodeURIComponent(session.token)}`);
  await postForm(`/repo/file/${encodeURIComponent(filePath)}/edit`, session.token, { content });
  await postForm("/repo/mr/new", session.token, {
    title: requireString(config.expectedMrTitle, "repo expectedMrTitle"),
    targetBranch: requireString(config.expectedTargetBranch, "repo expectedTargetBranch"),
  });
}
