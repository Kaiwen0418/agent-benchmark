import type { HostedSessionFor } from "../../runtime/types.js";

type RepoSession = HostedSessionFor<"repo-lite">;
import type { RepoFile, RepoMergeRequest } from "./types.js";

export function updateFileContent(session: RepoSession, path: string, newContent: string) {
  const file = session.state.files.find((candidate) => candidate.path === path);
  if (!file) {
    return { success: false, error: "File not found" } as const;
  }
  file.content = newContent;
  return { success: true, file } as const;
}

export function createMergeRequest(
  session: RepoSession,
  params: {
    title: string;
    targetBranch: string;
    makeId: (prefix: string) => string;
  },
) {
  const changedFiles = session.state.files.map((file) => ({ ...file }));

  const mr: RepoMergeRequest = {
    id: params.makeId("mr"),
    title: params.title,
    changedFiles,
    targetBranch: params.targetBranch,
  };
  session.state.mergeRequests.push(mr);
  return { success: true, mr } as const;
}
