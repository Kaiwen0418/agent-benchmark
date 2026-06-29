// Reference completion driver for repo-lite. Not executed by the unit suite;
// it documents how an agent satisfies each variant. The generic fetch-and-patch
// flow below covers both the easy single/secondary-file variants and the hard
// multi-file + CI variants (#114): each required edit is applied in place, then
// a single merge request is opened (the terminal action).
function unescapeHtml(value) {
  return value
    .replaceAll("&#039;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

async function readFileContent(hostedBaseUrl, session, checkedFetch, filePath) {
  const response = await checkedFetch(
    `${hostedBaseUrl}/repo/file/${encodeURIComponent(filePath)}/edit?session=${encodeURIComponent(session.token)}`,
  );
  const html = await response.text();
  const match = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
  return match ? unescapeHtml(match[1]) : "";
}

function applyEdit(content, expectedText, forbiddenText) {
  let next = content;
  if (forbiddenText && next.includes(forbiddenText)) {
    next = next.split(forbiddenText).join(expectedText);
  }
  if (!next.includes(expectedText)) {
    next = `${next.replace(/\s+$/, "")}\n${expectedText}\n`;
  }
  return next;
}

export async function complete({ session, config, hostedBaseUrl, checkedFetch, postForm, requireString }) {
  const edits = [
    {
      filePath: requireString(config.filePath, "repo filePath"),
      expectedText: requireString(config.expectedText, "repo expectedText"),
      forbiddenText: requireString(config.forbiddenText, "repo forbiddenText"),
    },
  ];

  if (typeof config.secondaryFilePath === "string" && typeof config.secondaryExpectedText === "string") {
    edits.push({
      filePath: config.secondaryFilePath,
      expectedText: config.secondaryExpectedText,
      forbiddenText: typeof config.secondaryForbiddenText === "string" ? config.secondaryForbiddenText : undefined,
    });
  }

  if (Array.isArray(config.additionalFileEdits)) {
    for (const edit of config.additionalFileEdits) {
      if (edit && typeof edit.filePath === "string" && typeof edit.expectedText === "string") {
        edits.push({
          filePath: edit.filePath,
          expectedText: edit.expectedText,
          forbiddenText: typeof edit.forbiddenText === "string" ? edit.forbiddenText : undefined,
        });
      }
    }
  }

  for (const edit of edits) {
    const current = await readFileContent(hostedBaseUrl, session, checkedFetch, edit.filePath);
    const next = applyEdit(current, edit.expectedText, edit.forbiddenText);
    await postForm(`/repo/file/${encodeURIComponent(edit.filePath)}/edit`, session.token, { content: next });
  }

  await postForm("/repo/mr/new", session.token, {
    title: requireString(config.expectedMrTitle, "repo expectedMrTitle"),
    targetBranch: requireString(config.expectedTargetBranch, "repo expectedTargetBranch"),
  });
}
