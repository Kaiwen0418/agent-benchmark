import { createRepoRoutes } from "../../routes/repo.js";
import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateRepo } from "./evaluate.js";
import { buildRepoFinalState } from "./final-state.js";
import { getRepoDefaultGoal, getRepoStartPath, repoSeedFiles, repoSeedIssues, repoSeedMergeRequests } from "./seed.js";
import type { RepoFile, RepoIssue, RepoMergeRequest } from "./types.js";

function isRepoFile(value: unknown): value is RepoFile {
  return isStateRecord(value) && typeof value.path === "string" && typeof value.content === "string";
}

function isRepoIssue(value: unknown): value is RepoIssue {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.labels) &&
    value.labels.every((label) => typeof label === "string") &&
    (value.status === "open" || value.status === "closed")
  );
}

function isRepoMergeRequest(value: unknown): value is RepoMergeRequest {
  return (
    isStateRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.changedFiles) &&
    value.changedFiles.every(isRepoFile) &&
    typeof value.targetBranch === "string"
  );
}

export const repoLiteDefinition: HostedAppDefinition<"repo-lite"> = {
  id: "repo-lite",
  stateKeys: ["files", "issues", "mergeRequests"],
  getDefaultStartPath: getRepoStartPath,
  getDefaultGoal: () => getRepoDefaultGoal(),
  buildInitialSessionState: () => ({
    files: repoSeedFiles.map((file) => ({ ...file })),
    issues: repoSeedIssues.map((issue) => ({ ...issue })),
    mergeRequests: [...repoSeedMergeRequests],
  }),
  hydratePersistedState: (value) => ({
    files: readStateArray(value, "files", isRepoFile),
    issues: readStateArray(value, "issues", isRepoIssue),
    mergeRequests: readStateArray(value, "mergeRequests", isRepoMergeRequest),
  }),
  buildFinalState: buildRepoFinalState,
  evaluate: evaluateRepo,
  createRoutes: (deps) => [createRepoRoutes(deps).handle],
};
