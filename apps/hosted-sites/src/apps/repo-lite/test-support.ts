import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

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
    file.content = file.content.replaceAll(configString(config, "forbiddenText"), configString(config, "expectedText"));
    session.state.mergeRequests.push({
      id: "mr-matrix",
      title: configString(config, "expectedMrTitle"),
      targetBranch: configString(config, "expectedTargetBranch"),
      changedFiles: [{ path: file.path, content: file.content }],
    });
  },
  breakPassingState(session) {
    session.state.mergeRequests[0]!.title = "Wrong title";
  },
};
