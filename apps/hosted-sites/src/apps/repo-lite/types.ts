export type RepoIssue = {
  id: string;
  title: string;
  labels: string[];
  status: "open" | "closed";
};

export type RepoFile = {
  path: string;
  content: string;
};

export type RepoMergeRequest = {
  id: string;
  title: string;
  changedFiles: Array<{ path: string; content: string }>;
  targetBranch: string;
  sourceBranch?: string;
  commitMessage?: string;
  reviewer?: string;
  conflictResolved?: boolean;
};

export type AppSessionState = {
  files: RepoFile[];
  issues: RepoIssue[];
  mergeRequests: RepoMergeRequest[];
};
