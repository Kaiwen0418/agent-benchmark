import type { HostedSession } from "../../runtime/types.js";
import type { ForumPost, ModerationAction } from "./types.js";

export function addReplyToThread(
  session: HostedSession,
  params: {
    threadId: string;
    author: string;
    body: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }
  if (thread.locked) {
    return { success: false, error: "Thread is locked" } as const;
  }

  const post: ForumPost = {
    id: params.makeId("post"),
    author: params.author,
    body: params.body,
  };
  thread.posts.push(post);
  return { success: true, post } as const;
}

export function lockThread(
  session: HostedSession,
  params: {
    threadId: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }

  thread.locked = true;
  const action: ModerationAction = {
    id: params.makeId("mod"),
    threadId: params.threadId,
    action: "lock",
    reason: params.reason,
  };
  session.moderationActions.push(action);
  return { success: true, action } as const;
}
