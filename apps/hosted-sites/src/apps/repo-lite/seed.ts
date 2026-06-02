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
