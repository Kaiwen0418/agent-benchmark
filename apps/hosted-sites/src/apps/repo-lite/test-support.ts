import { configString, configStringOrNull, type HostedAppTestSupport } from "../../runtime/test-support.js";
import { readAdditionalFileEdits } from "./workflow.js";

export const repoLiteTestSupport: HostedAppTestSupport<"repo-lite"> = {
  exampleTaskConfig: {
    filePath: "README.md",
    expectedText: "pnpm install",
    forbiddenText: "npm install",
    expectedMrTitle: "Fix install instructions",
    expectedTargetBranch: "main",
  },
  applyPassingState(session, config) {
    const filePath = configString(config, "filePath");
    const file = session.state.files.find((candidate) => candidate.path === filePath);
    if (!file) {
      throw new Error(`missing file ${filePath}`);
    }
    file.content = file.content.replaceAll(
      configString(config, "forbiddenText"),
      configString(config, "expectedText"),
    );

    const secondaryFilePath = configStringOrNull(config, "secondaryFilePath");
    const secondaryExpectedText = configStringOrNull(config, "secondaryExpectedText");
    const secondaryForbiddenText = configStringOrNull(config, "secondaryForbiddenText");
    if (secondaryFilePath && secondaryExpectedText) {
      const secondaryFile = session.state.files.find((candidate) => candidate.path === secondaryFilePath);
      if (!secondaryFile) {
        throw new Error(`missing secondary file ${secondaryFilePath}`);
      }
      if (secondaryForbiddenText) {
        secondaryFile.content = secondaryFile.content.replaceAll(
          secondaryForbiddenText,
          secondaryExpectedText,
        );
      } else {
        secondaryFile.content = `${secondaryFile.content.trimEnd()}\n${secondaryExpectedText}\n`;
      }
    }

    // Hard variants: apply each extra required edit, replacing a forbidden token
    // in place when present, otherwise appending the expected text.
    for (const edit of readAdditionalFileEdits(config)) {
      const target = session.state.files.find((candidate) => candidate.path === edit.filePath);
      if (!target) {
        throw new Error(`missing additional file ${edit.filePath}`);
      }
      if (edit.forbiddenText && target.content.includes(edit.forbiddenText)) {
        target.content = target.content.replaceAll(edit.forbiddenText, edit.expectedText);
      } else if (!target.content.includes(edit.expectedText)) {
        target.content = `${target.content.trimEnd()}\n${edit.expectedText}\n`;
      }
    }

    session.state.mergeRequests.push({
      id: "mr-matrix",
      title: configString(config, "expectedMrTitle"),
      targetBranch: configString(config, "expectedTargetBranch"),
      changedFiles: session.state.files.map((f) => ({ ...f })),
    });
  },
  breakPassingState(session) {
    session.state.mergeRequests[0]!.title = "Wrong title";
  },
};
