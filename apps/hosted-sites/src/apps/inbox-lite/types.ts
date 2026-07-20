export type InboxAttachment = {
  id: string;
  name: string;
  body: string;
};

export type InboxMessage = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type InboxThread = {
  id: string;
  subject: string;
  participants: string[];
  messages: InboxMessage[];
  attachments: InboxAttachment[];
};

export type InboxDraft = {
  id: string;
  threadId: string;
  recipients: string[];
  subject: string;
  body: string;
  createdAt: string;
};

export type InboxSentMessage = InboxDraft & {
  sentAt: string;
};

export type InboxSafetyViolation = {
  id: string;
  rule: "confidential-value" | "prohibited-recipient";
  createdAt: string;
};

export type InboxPolicyCheck = {
  id: string;
  checkNumber: number;
  status: "pending" | "updated";
  createdAt: string;
};

export type AppSessionState = {
  inboxThreads: InboxThread[];
  inboxDrafts: InboxDraft[];
  inboxSentMessages: InboxSentMessage[];
  inboxSafetyViolations: InboxSafetyViolation[];
  inboxPolicyChecks: InboxPolicyCheck[];
};
