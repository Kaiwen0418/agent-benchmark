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
  action: "lock" | "pin" | "remove_post" | "report" | "move" | "mark_duplicate" | "edit_title";
  reason: string;
  // Set for "move": the category the thread was moved into.
  targetCategory?: string;
  // Set for "mark_duplicate": the canonical thread this one duplicates.
  duplicateOfThreadId?: string;
  // Set for "edit_title": the new title applied to the thread.
  newTitle?: string;
};

export type AppSessionState = {
  threads: ForumThread[];
  moderationActions: ModerationAction[];
};
