export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const filePath = requireString(config.filePath, "repo filePath");
  const expectedText = requireString(config.expectedText, "repo expectedText");
  const forbiddenText = requireString(config.forbiddenText, "repo forbiddenText");
  const secondaryFilePath = config.secondaryFilePath;
  const secondaryExpectedText = config.secondaryExpectedText;
  const secondaryForbiddenText = config.secondaryForbiddenText;

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

  if (secondaryFilePath) {
    let secondaryContent;
    if (secondaryFilePath === "package.json" && secondaryExpectedText === "1.0.1") {
      secondaryContent = '{\n  "name": "demo-project",\n  "version": "1.0.1"\n}\n';
    } else if (secondaryFilePath === "package.json" && secondaryExpectedText === "demo-yarn-project") {
      secondaryContent = '{\n  "name": "demo-yarn-project",\n  "version": "1.0.0"\n}\n';
    } else if (secondaryFilePath === "package.json" && secondaryExpectedText === "test") {
      secondaryContent = '{\n  "name": "demo-project",\n  "version": "1.0.0",\n  "scripts": {\n    "test": "echo \\"Error: no test specified\\""\n  }\n}\n';
    } else {
      throw new Error(`unsupported secondary file variant: ${secondaryFilePath} / ${secondaryExpectedText}`);
    }
    await checkedFetch(`${hostedBaseUrl}/repo/file/${encodeURIComponent(secondaryFilePath)}/edit?session=${encodeURIComponent(session.token)}`);
    await postForm(`/repo/file/${encodeURIComponent(secondaryFilePath)}/edit`, session.token, { content: secondaryContent });
  }

  await postForm("/repo/mr/new", session.token, {
    title: requireString(config.expectedMrTitle, "repo expectedMrTitle"),
    targetBranch: requireString(config.expectedTargetBranch, "repo expectedTargetBranch"),
  });
}
