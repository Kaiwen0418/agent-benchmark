import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { RepoFile, RepoMergeRequest } from "./types.js";
import { configString, readTaskConfig } from "../../runtime/question-config.js";

function containsStandaloneText(content: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?:$|[^A-Za-z0-9_])`).test(content);
}

export type RepoEvaluationSession = {
  app: "repo-lite" | string;
  taskSlug: string;
  metadata: Record<string, unknown>;
  state: {
    files: RepoFile[];
    mergeRequests: RepoMergeRequest[];
  };
};

export function evaluateRepo(session: RepoEvaluationSession): HostedWebScoreResult {
  const latestMR = session.state.mergeRequests.at(-1);
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
    passSummary: "The generated file-edit and merge-request requirements were satisfied.",
    failSummary: "One or more required repo conditions were not met.",
  });
}

function evaluateRepoBackendState(
  session: RepoEvaluationSession,
  mr: RepoMergeRequest | undefined,
): HostedWebEvaluatorResult {
  const config = readTaskConfig(session.metadata);
  const filePath = configString(config, "filePath");
  const expectedText = configString(config, "expectedText");
  const forbiddenText = configString(config, "forbiddenText");
  const expectedMrTitle = configString(config, "expectedMrTitle");
  const expectedTargetBranch = configString(config, "expectedTargetBranch");
  const file = session.state.files.find((candidate) => candidate.path === filePath);
  const fileHasExpectedText = file ? file.content.includes(expectedText) : false;
  const fileHasForbiddenText = file ? containsStandaloneText(file.content, forbiddenText) : true;

  if (!mr) {
    return failedEvaluator({
      type: "backend_state",
      name: "correct merge request created",
      errorMessage: "No merge request was created.",
      evidence: {
        filePath,
        fileHasExpectedText,
        fileHasForbiddenText,
        mrTitle: null,
        targetBranch: null,
      },
    });
  }

  const titleMatches = mr.title.trim() === expectedMrTitle;
  const targetBranchMatches = mr.targetBranch.trim().toLowerCase() === expectedTargetBranch.toLowerCase();
  const pass = titleMatches && targetBranchMatches && fileHasExpectedText && !fileHasForbiddenText;

  const evidence = {
    mrTitle: mr.title,
    targetBranch: mr.targetBranch,
    titleMatches,
    targetBranchMatches,
    filePath,
    fileHasExpectedText,
    fileHasForbiddenText,
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
          "The edited file and merge request do not satisfy the generated task configuration.",
        evidence,
      });
}
