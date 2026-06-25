export type ForumPost = {
  id: string;
  author: string;
  body: string;
};

export type ForumThread = {
  id: string;
  title: string;
  category: string;
  posts: ForumPost[];
  locked?: boolean;
  pinned?: boolean;
};

export type ModerationAction = {
  id: string;
  threadId: string;
  action: "lock" | "pin" | "remove_post" | "report";
  reason: string;
};

export type AppSessionState = {
  threads: ForumThread[];
  moderationActions: ModerationAction[];
};
