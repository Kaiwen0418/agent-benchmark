import type { HostedSessionFor } from "../../runtime/types.js";

type ForumSession = HostedSessionFor<"forum-lite">;
import type { ForumPost, ModerationAction } from "./types.js";

export function addReplyToThread(
  session: ForumSession,
  params: {
    threadId: string;
    author: string;
    body: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
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
  session: ForumSession,
  params: {
    threadId: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
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
  session.state.moderationActions.push(action);
  return { success: true, action } as const;
}

export function pinThread(
  session: ForumSession,
  params: {
    threadId: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }
  if (!thread.locked) {
    return { success: false, error: "Thread must be locked before pinning" } as const;
  }

  thread.pinned = true;
  const action: ModerationAction = {
    id: params.makeId("mod"),
    threadId: params.threadId,
    action: "pin",
    reason: params.reason,
  };
  session.state.moderationActions.push(action);
  return { success: true, action } as const;
}

export function reportThread(
  session: ForumSession,
  params: {
    threadId: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }
  if (thread.locked) {
    return { success: false, error: "Cannot report a locked thread" } as const;
  }

  const action: ModerationAction = {
    id: params.makeId("mod"),
    threadId: params.threadId,
    action: "report",
    reason: params.reason,
  };
  session.state.moderationActions.push(action);
  return { success: true, action } as const;
}

export function moveThread(
  session: ForumSession,
  params: {
    threadId: string;
    category: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }
  if (thread.locked) {
    return { success: false, error: "Cannot move a locked thread" } as const;
  }

  thread.category = params.category;
  const action: ModerationAction = {
    id: params.makeId("mod"),
    threadId: params.threadId,
    action: "move",
    reason: params.reason,
    targetCategory: params.category,
  };
  session.state.moderationActions.push(action);
  return { success: true, action } as const;
}

export function editThreadTitle(
  session: ForumSession,
  params: {
    threadId: string;
    title: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }
  if (thread.locked) {
    return { success: false, error: "Cannot edit the title of a locked thread" } as const;
  }

  thread.title = params.title;
  const action: ModerationAction = {
    id: params.makeId("mod"),
    threadId: params.threadId,
    action: "edit_title",
    reason: params.reason,
    newTitle: params.title,
  };
  session.state.moderationActions.push(action);
  return { success: true, action } as const;
}

export function markThreadDuplicate(
  session: ForumSession,
  params: {
    threadId: string;
    duplicateOfThreadId: string;
    reason: string;
    makeId: (prefix: string) => string;
  },
) {
  const thread = session.state.threads.find((candidate) => candidate.id === params.threadId);
  if (!thread) {
    return { success: false, error: "Thread not found" } as const;
  }
  if (thread.locked) {
    return { success: false, error: "Cannot mark a locked thread as duplicate" } as const;
  }
  if (params.duplicateOfThreadId === params.threadId) {
    return { success: false, error: "A thread cannot be a duplicate of itself" } as const;
  }
  const canonical = session.state.threads.find((candidate) => candidate.id === params.duplicateOfThreadId);
  if (!canonical) {
    return { success: false, error: "Canonical thread not found" } as const;
  }

  const action: ModerationAction = {
    id: params.makeId("mod"),
    threadId: params.threadId,
    action: "mark_duplicate",
    reason: params.reason,
    duplicateOfThreadId: params.duplicateOfThreadId,
  };
  session.state.moderationActions.push(action);
  return { success: true, action } as const;
}
