import {
  aggregateStrictScore,
  failedEvaluator,
  passedEvaluator,
  type HostedWebEvaluatorResult,
  type HostedWebScoreResult,
} from "@agentbench/scoring";
import type { RepoFile, RepoMergeRequest } from "./types.js";
import { configString, configStringOrNull, readTaskConfig } from "../../runtime/question-config.js";
import { additionalEditSatisfied, readAdditionalFileEdits } from "./workflow.js";

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
  const secondaryFilePath = configStringOrNull(config, "secondaryFilePath");
  const secondaryExpectedText = configStringOrNull(config, "secondaryExpectedText");
  const secondaryForbiddenText = configStringOrNull(config, "secondaryForbiddenText");
  const expectedSourceBranch = configStringOrNull(config, "expectedSourceBranch");
  const expectedCommitMessage = configStringOrNull(config, "expectedCommitMessage");
  const expectedReviewer = configStringOrNull(config, "expectedReviewer");
  const requiresConflictResolution = config.requiresConflictResolution === true;

  const file = session.state.files.find((candidate) => candidate.path === filePath);
  const fileHasExpectedText = file ? file.content.includes(expectedText) : false;
  const fileHasForbiddenText = file ? containsStandaloneText(file.content, forbiddenText) : true;

  const secondaryFile = secondaryFilePath
    ? session.state.files.find((candidate) => candidate.path === secondaryFilePath)
    : undefined;
  const secondaryHasExpectedText =
    secondaryFilePath == null || secondaryExpectedText == null
      ? true
      : secondaryFile != null && secondaryFile.content.includes(secondaryExpectedText);
  const secondaryHasForbiddenText =
    secondaryFilePath == null || secondaryForbiddenText == null
      ? false
      : secondaryFile != null && containsStandaloneText(secondaryFile.content, secondaryForbiddenText);

  // Hard variants require additional coherent edits across further files. Each
  // edit reports only its file path and a satisfied flag — never the expected
  // text — so evidence does not leak the canonical answer.
  const additionalFileEdits = readAdditionalFileEdits(config);
  const additionalEditResults = additionalFileEdits.map((edit) => ({
    filePath: edit.filePath,
    satisfied: additionalEditSatisfied(session.state.files, edit),
  }));
  const additionalEditsSatisfied = additionalEditResults.every((result) => result.satisfied);

  if (!mr) {
    return failedEvaluator({
      type: "backend_state",
      name: "correct merge request created",
      errorMessage: "No merge request was created.",
      evidence: {
        filePath,
        fileHasExpectedText,
        fileHasForbiddenText,
        secondaryFilePath,
        secondaryHasExpectedText,
        secondaryHasForbiddenText,
        additionalEdits: additionalEditResults,
        mrTitle: null,
        targetBranch: null,
      },
    });
  }

  const titleMatches = mr.title.trim() === expectedMrTitle;
  const targetBranchMatches = mr.targetBranch.trim().toLowerCase() === expectedTargetBranch.toLowerCase();
  const sourceBranchMatches =
    expectedSourceBranch == null || mr.sourceBranch?.trim() === expectedSourceBranch;
  const commitMessageMatches =
    expectedCommitMessage == null || mr.commitMessage?.trim() === expectedCommitMessage;
  const reviewerMatches =
    expectedReviewer == null || mr.reviewer?.trim().toLowerCase() === expectedReviewer.toLowerCase();
  const conflictResolutionMatches = !requiresConflictResolution || mr.conflictResolved === true;
  const pass =
    titleMatches &&
    targetBranchMatches &&
    fileHasExpectedText &&
    !fileHasForbiddenText &&
    secondaryHasExpectedText &&
    !secondaryHasForbiddenText &&
    additionalEditsSatisfied &&
    sourceBranchMatches &&
    commitMessageMatches &&
    reviewerMatches &&
    conflictResolutionMatches;

  const evidence = {
    mrTitle: mr.title,
    targetBranch: mr.targetBranch,
    titleMatches,
    targetBranchMatches,
    sourceBranch: mr.sourceBranch ?? null,
    sourceBranchMatches,
    commitMessage: mr.commitMessage ?? null,
    commitMessageMatches,
    reviewer: mr.reviewer ?? null,
    reviewerMatches,
    conflictResolved: mr.conflictResolved ?? false,
    conflictResolutionMatches,
    filePath,
    fileHasExpectedText,
    fileHasForbiddenText,
    secondaryFilePath,
    secondaryHasExpectedText,
    secondaryHasForbiddenText,
    additionalEdits: additionalEditResults,
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
          "The edited file(s) and merge request do not satisfy the generated task configuration.",
        evidence,
      });
}
