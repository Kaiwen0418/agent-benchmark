import type { RepoFile, RepoIssue, RepoMergeRequest } from "./types.js";

export const repoSeedFiles: RepoFile[] = [
  {
    path: "README.md",
    content: "# Demo Project\n\n## Install\n\nRun `npm install` to install dependencies.\n\n## Usage\n\nStart the dev server with `npm run dev`.\n",
  },
  {
    path: "package.json",
    content: '{\n  "name": "demo-project",\n  "version": "1.0.0"\n}\n',
  },
  // Additional source files used by the hard repo workflow variants (#114),
  // where a coherent change must touch several files and pass simulated CI.
  // Easy variants ignore these files; they are inert distractors there.
  {
    path: "src/version.ts",
    content: 'export const VERSION = "1.0.0";\n',
  },
  {
    path: "src/config.ts",
    content: 'export const APP_NAME = "demo-project";\n',
  },
  {
    path: "src/api.ts",
    content: 'export const API_VERSION = "v1";\n',
  },
  {
    path: "CHANGELOG.md",
    content: "# Changelog\n\n## 1.0.0\n\n- Initial release.\n",
  },
  {
    path: "docs/API.md",
    content: "# API Reference\n\nStable version: v1.\n",
  },
];

export const repoSeedIssues: RepoIssue[] = [
  {
    id: "issue-1",
    title: "README uses wrong install command",
    labels: ["docs", "good-first-issue"],
    status: "open",
  },
];

export const repoSeedMergeRequests: RepoMergeRequest[] = [];

export function getRepoStartPath() {
  return "/repo";
}

export function getRepoDefaultGoal() {
  return 'Fix the README install command to use pnpm, then open a merge request titled "Fix install instructions" targeting main.';
}
