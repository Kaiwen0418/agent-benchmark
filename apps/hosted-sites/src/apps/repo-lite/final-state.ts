import type { HostedSession } from "../../runtime/types.js";

export function buildRepoFinalState(session: HostedSession) {
  const readme = session.files.find((f) => f.path === "README.md");
  const latestMR = session.mergeRequests.at(-1);

  return {
    app: "repo-lite",
    taskSlug: session.taskSlug,
    readme: readme
      ? {
          path: readme.path,
          hasPnpmInstall: readme.content.includes("pnpm install"),
          hasNpmInstall: readme.content.includes("npm install"),
        }
      : null,
    latestMR: latestMR
      ? {
          id: latestMR.id,
          title: latestMR.title,
          targetBranch: latestMR.targetBranch,
        }
      : null,
  };
}
