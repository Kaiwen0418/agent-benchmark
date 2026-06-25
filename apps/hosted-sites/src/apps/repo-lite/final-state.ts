import { configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";

export function buildRepoFinalState(session: HostedSessionFor<"repo-lite">) {
  const config = readTaskConfig(session.metadata);
  const secondaryFilePath = configStringOrNull(config, "secondaryFilePath");
  const secondaryExpectedText = configStringOrNull(config, "secondaryExpectedText");
  const secondaryForbiddenText = configStringOrNull(config, "secondaryForbiddenText");
  const readme = session.state.files.find((f) => f.path === "README.md");
  const latestMR = session.state.mergeRequests.at(-1);
  const secondaryFile = secondaryFilePath
    ? session.state.files.find((f) => f.path === secondaryFilePath)
    : undefined;

  return {
    app: "repo-lite",
    taskSlug: session.taskSlug,
    readme: readme
      ? {
          path: readme.path,
          hasPnpmInstall: readme.content.includes("pnpm install"),
          hasNpmInstall: readme.content.includes("npm install"),
        }
      : null,
    secondaryFile:
      secondaryFilePath && secondaryFile
        ? {
            path: secondaryFile.path,
            hasExpectedText:
              secondaryExpectedText == null || secondaryFile.content.includes(secondaryExpectedText),
            hasForbiddenText:
              secondaryForbiddenText != null &&
              containsStandaloneText(secondaryFile.content, secondaryForbiddenText),
          }
        : null,
    latestMR: latestMR
      ? {
          id: latestMR.id,
          title: latestMR.title,
          targetBranch: latestMR.targetBranch,
        }
      : null,
  };
}

function containsStandaloneText(content: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?:$|[^A-Za-z0-9_])`).test(content);
}
