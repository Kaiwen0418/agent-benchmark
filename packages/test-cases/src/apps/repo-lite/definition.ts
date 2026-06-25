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
  }),
  variantPools: {
    default: [
      { id: "pnpm-install", goal: "Replace the README install command with `pnpm install`, remove `npm install`, then open a merge request titled `Fix install instructions` targeting `main`.", taskConfig: { filePath: "README.md", expectedText: "pnpm install", forbiddenText: "npm install", expectedMrTitle: "Fix install instructions", expectedTargetBranch: "main" } },
      { id: "yarn-install", goal: "Replace the README install command with `yarn install`, remove `npm install`, then open a merge request titled `Document Yarn setup` targeting `main`.", taskConfig: { filePath: "README.md", expectedText: "yarn install", forbiddenText: "npm install", expectedMrTitle: "Document Yarn setup", expectedTargetBranch: "main" } },
      { id: "bun-install", goal: "Replace the README install command with `bun install`, remove `npm install`, then open a merge request titled `Add Bun setup` targeting `develop`.", taskConfig: { filePath: "README.md", expectedText: "bun install", forbiddenText: "npm install", expectedMrTitle: "Add Bun setup", expectedTargetBranch: "develop" } },
    ],
  },
});
