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
    expectedSourceBranch: z.string().min(1).optional(),
    expectedCommitMessage: z.string().min(1).optional(),
    expectedReviewer: z.string().min(1).optional(),
    requiresConflictResolution: z.boolean().optional(),
    secondaryFilePath: z.string().min(1).optional(),
    secondaryExpectedText: z.string().min(1).optional(),
    secondaryForbiddenText: z.string().min(1).optional(),
    // Hard variants (#114): a coherent change spanning three or more files plus
    // a simulated CI gate. additionalFileEdits are extra required edits beyond
    // the primary/secondary files; ciChecks describe consistency tokens that
    // must appear across a set of files (surfaced to the agent as CI status).
    additionalFileEdits: z
      .array(
        z.object({
          filePath: z.string().min(1),
          expectedText: z.string().min(1),
          forbiddenText: z.string().min(1).optional(),
        }),
      )
      .min(1)
      .optional(),
    ciChecks: z
      .array(
        z.object({
          name: z.string().min(1),
          token: z.string().min(1),
          files: z.array(z.string().min(1)).min(1),
        }),
      )
      .min(1)
      .optional(),
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
    hard: [
      {
        id: "release-2-0-0",
        goal: "Cut release 2.0.0: bump the version to `2.0.0` in both `package.json` and `src/version.ts`, add a `## 2.0.0` section to `CHANGELOG.md` so the version-consistency CI check passes, then open a merge request titled `Release 2.0.0` targeting `release`.",
        taskConfig: {
          filePath: "package.json",
          expectedText: '"version": "2.0.0"',
          forbiddenText: '"version": "1.0.0"',
          expectedMrTitle: "Release 2.0.0",
          expectedTargetBranch: "release",
          secondaryFilePath: "src/version.ts",
          secondaryExpectedText: 'VERSION = "2.0.0"',
          secondaryForbiddenText: 'VERSION = "1.0.0"',
          additionalFileEdits: [{ filePath: "CHANGELOG.md", expectedText: "## 2.0.0" }],
          ciChecks: [
            { name: "Version consistency", token: "2.0.0", files: ["package.json", "src/version.ts", "CHANGELOG.md"] },
          ],
        },
      },
      {
        id: "rename-to-acme-cli",
        goal: "Rename the project to `acme-cli`: update `name` in `package.json`, `APP_NAME` in `src/config.ts`, and reference `acme-cli` in `README.md` so the project-name CI check passes, then open a merge request titled `Rename project to acme-cli` targeting `main`.",
        taskConfig: {
          filePath: "package.json",
          expectedText: '"name": "acme-cli"',
          forbiddenText: '"name": "demo-project"',
          expectedMrTitle: "Rename project to acme-cli",
          expectedTargetBranch: "main",
          secondaryFilePath: "src/config.ts",
          secondaryExpectedText: 'APP_NAME = "acme-cli"',
          secondaryForbiddenText: 'APP_NAME = "demo-project"',
          additionalFileEdits: [{ filePath: "README.md", expectedText: "acme-cli" }],
          ciChecks: [
            { name: "Project name consistency", token: "acme-cli", files: ["package.json", "src/config.ts", "README.md"] },
          ],
        },
      },
      {
        id: "api-v2-rollout",
        goal: "Roll out API v2: set `API_VERSION` to `v2` in `src/api.ts`, update the stable version to `v2` in `docs/API.md`, note `API v2` in `README.md` so the API-version CI check passes, then open a merge request titled `Roll out API v2` targeting `develop`.",
        taskConfig: {
          filePath: "src/api.ts",
          expectedText: 'API_VERSION = "v2"',
          forbiddenText: 'API_VERSION = "v1"',
          expectedMrTitle: "Roll out API v2",
          expectedTargetBranch: "develop",
          secondaryFilePath: "docs/API.md",
          secondaryExpectedText: "Stable version: v2",
          secondaryForbiddenText: "Stable version: v1",
          additionalFileEdits: [{ filePath: "README.md", expectedText: "API v2" }],
          ciChecks: [
            { name: "API version consistency", token: "v2", files: ["src/api.ts", "docs/API.md", "README.md"] },
          ],
        },
      },
      {
        id: "api-v3-conflict-rollout",
        goal: "Roll out API v3 from feature branch `feature/api-v3`: update `API_VERSION` to `v3` in `src/api.ts`, set `Stable version: v3` in `docs/API.md`, and add `API v3` to `README.md`. Resolve the simulated target-branch conflict, commit with message `feat: roll out api v3`, request review from `mira`, then open merge request `Roll out API v3` targeting `develop`.",
        taskConfig: {
          filePath: "src/api.ts",
          expectedText: 'API_VERSION = "v3"',
          forbiddenText: 'API_VERSION = "v1"',
          expectedMrTitle: "Roll out API v3",
          expectedTargetBranch: "develop",
          expectedSourceBranch: "feature/api-v3",
          expectedCommitMessage: "feat: roll out api v3",
          expectedReviewer: "mira",
          requiresConflictResolution: true,
          secondaryFilePath: "docs/API.md",
          secondaryExpectedText: "Stable version: v3",
          secondaryForbiddenText: "Stable version: v1",
          additionalFileEdits: [{ filePath: "README.md", expectedText: "API v3" }],
          ciChecks: [
            { name: "API version consistency", token: "v3", files: ["src/api.ts", "docs/API.md", "README.md"] },
          ],
        },
      },
    ],
  },
});
