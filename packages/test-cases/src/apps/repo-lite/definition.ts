import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const repoLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "repo-lite",
  taskConfigSchema: z.object({
    filePath: z.string().min(1),
    expectedText: z.string().min(1),
    forbiddenText: z.string().min(1),
    expectedMrTitle: z.string().min(1),
    expectedTargetBranch: z.string().min(1),
    secondaryFilePath: z.string().min(1).optional(),
    secondaryExpectedText: z.string().min(1).optional(),
    secondaryForbiddenText: z.string().min(1).optional(),
  }),
  variantPools: {
    default: [
      { id: "pnpm-install", goal: "Replace the README install command with `pnpm install`, remove `npm install`, then open a merge request titled `Fix install instructions` targeting `main`.", taskConfig: { filePath: "README.md", expectedText: "pnpm install", forbiddenText: "npm install", expectedMrTitle: "Fix install instructions", expectedTargetBranch: "main" } },
      { id: "yarn-install", goal: "Replace the README install command with `yarn install`, remove `npm install`, then open a merge request titled `Document Yarn setup` targeting `main`.", taskConfig: { filePath: "README.md", expectedText: "yarn install", forbiddenText: "npm install", expectedMrTitle: "Document Yarn setup", expectedTargetBranch: "main" } },
      { id: "bun-install", goal: "Replace the README install command with `bun install`, remove `npm install`, then open a merge request titled `Add Bun setup` targeting `develop`.", taskConfig: { filePath: "README.md", expectedText: "bun install", forbiddenText: "npm install", expectedMrTitle: "Add Bun setup", expectedTargetBranch: "develop" } },
      { id: "pnpm-install-and-version", goal: "Replace the README install command with `pnpm install`, bump `package.json` version from `1.0.0` to `1.0.1`, then open a merge request titled `Fix install and bump version` targeting `main`.", taskConfig: { filePath: "README.md", expectedText: "pnpm install", forbiddenText: "npm install", expectedMrTitle: "Fix install and bump version", expectedTargetBranch: "main", secondaryFilePath: "package.json", secondaryExpectedText: "1.0.1", secondaryForbiddenText: "1.0.0" } },
      { id: "yarn-install-and-rename", goal: "Replace the README install command with `yarn install`, rename the project in `package.json` from `demo-project` to `demo-yarn-project`, then open a merge request titled `Update README and rename project` targeting `main`.", taskConfig: { filePath: "README.md", expectedText: "yarn install", forbiddenText: "npm install", expectedMrTitle: "Update README and rename project", expectedTargetBranch: "main", secondaryFilePath: "package.json", secondaryExpectedText: "demo-yarn-project", secondaryForbiddenText: "demo-project" } },
      { id: "bun-install-and-script", goal: "Replace the README install command with `bun install`, add a `test` script to `package.json`, then open a merge request titled `Add Bun and test script` targeting `develop`.", taskConfig: { filePath: "README.md", expectedText: "bun install", forbiddenText: "npm install", expectedMrTitle: "Add Bun and test script", expectedTargetBranch: "develop", secondaryFilePath: "package.json", secondaryExpectedText: "test" } },
    ],
  },
});
