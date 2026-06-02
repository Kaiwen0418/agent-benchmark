import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { RepoFile, RepoMergeRequest } from "./types.js";

export type RepoEvaluationSession = {
  app: "repo-lite" | string;
  taskSlug: string;
  files: RepoFile[];
  mergeRequests: RepoMergeRequest[];
};

const EXPECTED_MR_TITLE = "Fix install instructions";
const EXPECTED_TARGET_BRANCH = "main";
const BAD_COMMAND = "npm install";
const GOOD_COMMAND = "pnpm install";

export function evaluateRepo(session: RepoEvaluationSession): HostedWebScoreResult {
  const latestMR = session.mergeRequests.at(-1);
  const backend = evaluateRepoBackendState(session, latestMR);
  const ui = latestMR
    ? passedEvaluator({
        type: "ui_state",
        name: "merge request confirmation visible",
        required: false,
        evidence: { mrId: latestMR.id, title: latestMR.title },
      })
    : failedEvaluator({
        type: "ui_state",
        name: "merge request confirmation visible",
        required: false,
        errorMessage: "No merge request was created.",
      });

  return aggregateStrictScore({
    evaluators: [backend, ui],
    passSummary: "README was fixed to use pnpm install and a correct MR was opened targeting main.",
    failSummary: "One or more required repo conditions were not met.",
  });
}

function evaluateRepoBackendState(
  session: RepoEvaluationSession,
  mr: RepoMergeRequest | undefined,
): HostedWebEvaluatorResult {
  const readme = session.files.find((f) => f.path === "README.md");
  const readmeHasGoodCommand = readme ? readme.content.includes(GOOD_COMMAND) : false;
  const readmeHasBadCommand = readme ? /\bnpm install\b/.test(readme.content) : true;

  if (!mr) {
    return failedEvaluator({
      type: "backend_state",
      name: "correct merge request created",
      errorMessage: "No merge request was created.",
      evidence: {
        readmeHasGoodCommand,
        readmeHasBadCommand,
        mrTitle: null,
        targetBranch: null,
      },
    });
  }

  const titleMatches = mr.title.trim() === EXPECTED_MR_TITLE;
  const targetBranchMatches = mr.targetBranch.trim().toLowerCase() === EXPECTED_TARGET_BRANCH.toLowerCase();
  const pass = titleMatches && targetBranchMatches && readmeHasGoodCommand && !readmeHasBadCommand;

  const evidence = {
    mrTitle: mr.title,
    targetBranch: mr.targetBranch,
    titleMatches,
    targetBranchMatches,
    readmeHasGoodCommand,
    readmeHasBadCommand,
  };

  return pass
    ? passedEvaluator({
        type: "backend_state",
        name: "correct merge request created",
        evidence,
      })
    : failedEvaluator({
        type: "backend_state",
        name: "correct merge request created",
        errorMessage:
          "MR title must be 'Fix install instructions', target branch must be 'main', README must contain 'pnpm install' and must not contain 'npm install'.",
        evidence,
      });
}
