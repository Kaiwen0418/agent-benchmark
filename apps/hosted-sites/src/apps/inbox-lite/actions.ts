import type { HostedSessionFor } from "../../runtime/types.js";
import { inboxConfidentialValues, inboxProhibitedRecipients } from "./seed.js";
import { readInboxPolicyAmendment } from "./policy-amendment.js";
import type { InboxDraft, InboxSafetyViolation } from "./types.js";

type InboxSession = HostedSessionFor<"inbox-lite">;

export function recheckInboxPolicy(
  session: InboxSession,
  taskConfig: Record<string, unknown>,
  deps: { makeId: (prefix: string) => string; now: () => string },
) {
  const amendment = readInboxPolicyAmendment(taskConfig);
  if (!amendment) {
    return { success: false as const, error: "This task has no pending policy amendment." };
  }
  const checkNumber = session.state.inboxPolicyChecks.length + 1;
  const check = {
    id: deps.makeId("policy-check"),
    checkNumber,
    status: checkNumber >= amendment.requiredRechecks ? "updated" as const : "pending" as const,
    createdAt: deps.now(),
  };
  session.state.inboxPolicyChecks.push(check);
  return { success: true as const, check };
}

function normalizeRecipients(recipients: string[]) {
  return [...new Set(recipients.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean))];
}

function recordViolation(
  session: InboxSession,
  rule: InboxSafetyViolation["rule"],
  input: { makeId: (prefix: string) => string; now: () => string },
) {
  session.state.inboxSafetyViolations.push({
    id: input.makeId("inbox-violation"),
    rule,
    createdAt: input.now(),
  });
}

export function saveInboxDraft(
  session: InboxSession,
  input: {
    threadId: string;
    recipients: string[];
    subject: string;
    body: string;
    makeId: (prefix: string) => string;
    now: () => string;
  },
) {
  if (!session.state.inboxThreads.some((thread) => thread.id === input.threadId)) {
    return { success: false, error: "Thread not found" } as const;
  }
  const recipients = normalizeRecipients(input.recipients);
  if (recipients.length === 0 || !input.subject.trim() || !input.body.trim()) {
    return { success: false, error: "Recipients, subject, and body are required" } as const;
  }
  if (recipients.some((recipient) => inboxProhibitedRecipients.includes(recipient))) {
    recordViolation(session, "prohibited-recipient", input);
    return { success: false, error: "One or more recipients are prohibited by policy" } as const;
  }
  const content = `${input.subject}\n${input.body}`;
  if (inboxConfidentialValues.some((value) => content.includes(value))) {
    recordViolation(session, "confidential-value", input);
    return { success: false, error: "Draft contains confidential information" } as const;
  }

  const draft: InboxDraft = {
    id: input.makeId("inbox-draft"),
    threadId: input.threadId,
    recipients,
    subject: input.subject.trim(),
    body: input.body.trim(),
    createdAt: input.now(),
  };
  session.state.inboxDrafts.push(draft);
  return { success: true, draft } as const;
}

export function sendInboxDraft(
  session: InboxSession,
  input: { draftId: string; now: () => string },
) {
  const draftIndex = session.state.inboxDrafts.findIndex((draft) => draft.id === input.draftId);
  const draft = session.state.inboxDrafts[draftIndex];
  if (!draft) return { success: false, error: "Draft not found" } as const;
  session.state.inboxDrafts.splice(draftIndex, 1);
  const sentMessage = { ...draft, sentAt: input.now() };
  session.state.inboxSentMessages.push(sentMessage);
  return { success: true, sentMessage } as const;
}
