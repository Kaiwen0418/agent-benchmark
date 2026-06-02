import type { HostedSession } from "../../runtime/types.js";
import type { RepoFile, RepoMergeRequest } from "./types.js";

export function updateFileContent(session: HostedSession, path: string, newContent: string) {
  const file = session.files.find((candidate) => candidate.path === path);
  if (!file) {
    return { success: false, error: "File not found" } as const;
  }
  file.content = newContent;
  return { success: true, file } as const;
}

export function createMergeRequest(
  session: HostedSession,
  params: {
    title: string;
    targetBranch: string;
    makeId: (prefix: string) => string;
  },
) {
  const changedFiles = session.files
    .map((file) => ({ ...file }))
    .filter((file) => file.path === "README.md");

  const mr: RepoMergeRequest = {
    id: params.makeId("mr"),
    title: params.title,
    changedFiles,
    targetBranch: params.targetBranch,
  };
  session.mergeRequests.push(mr);
  return { success: true, mr } as const;
}
