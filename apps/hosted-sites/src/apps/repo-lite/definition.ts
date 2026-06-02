import { createRepoRoutes } from "../../routes/repo.js";
import type { HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateRepo } from "./evaluate.js";
import { buildRepoFinalState } from "./final-state.js";
import { getRepoDefaultGoal, getRepoStartPath, repoSeedFiles, repoSeedIssues, repoSeedMergeRequests } from "./seed.js";

export const repoLiteDefinition: HostedAppDefinition = {
  id: "repo-lite",
  getDefaultStartPath: getRepoStartPath,
  getDefaultGoal: () => getRepoDefaultGoal(),
  buildInitialSessionState: () => ({
    files: repoSeedFiles.map((file) => ({ ...file })),
    issues: repoSeedIssues.map((issue) => ({ ...issue })),
    mergeRequests: [...repoSeedMergeRequests],
  }),
  buildFinalState: buildRepoFinalState,
  evaluate: evaluateRepo,
  createRoutes: (deps) => [createRepoRoutes(deps).handle],
};
