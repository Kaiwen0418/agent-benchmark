import { configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";
import {
  additionalEditSatisfied,
  computeCiStatuses,
  readAdditionalFileEdits,
  readCiChecks,
} from "./workflow.js";

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

  // Derived observations only: file paths and pass/fail flags, never the
  // configured expected text or CI tokens (the canonical answer).
  const additionalEdits = readAdditionalFileEdits(config).map((edit) => ({
    path: edit.filePath,
    satisfied: additionalEditSatisfied(session.state.files, edit),
  }));
  const ciChecks = computeCiStatuses(session.state.files, readCiChecks(config)).map((status) => ({
    name: status.name,
    passed: status.passed,
  }));

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
    additionalEdits: additionalEdits.length ? additionalEdits : null,
    ciChecks: ciChecks.length ? ciChecks : null,
    latestMR: latestMR
      ? {
          id: latestMR.id,
          title: latestMR.title,
          targetBranch: latestMR.targetBranch,
          sourceBranch: latestMR.sourceBranch ?? null,
          commitMessage: latestMR.commitMessage ?? null,
          reviewer: latestMR.reviewer ?? null,
          conflictResolved: latestMR.conflictResolved ?? false,
        }
      : null,
  };
}

function containsStandaloneText(content: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?:$|[^A-Za-z0-9_])`).test(content);
}
