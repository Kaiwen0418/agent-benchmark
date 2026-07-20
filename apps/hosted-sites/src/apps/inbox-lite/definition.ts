import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluateInboxLite } from "./evaluate.js";
import { buildInboxLiteFinalState } from "./final-state.js";
import { createInboxLiteRoutes } from "./routes.js";
import { getInboxLiteDefaultGoal, getInboxLiteStartPath, inboxSeedThreads } from "./seed.js";
import type {
  InboxAttachment,
  InboxDraft,
  InboxMessage,
  InboxPolicyCheck,
  InboxSafetyViolation,
  InboxSentMessage,
  InboxThread,
} from "./types.js";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isInboxMessage(value: unknown): value is InboxMessage {
  return isStateRecord(value)
    && typeof value.id === "string"
    && typeof value.author === "string"
    && typeof value.body === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && typeof value.revisionCount === "number"
    && Number.isInteger(value.revisionCount)
    && value.revisionCount >= 0;
}

function isInboxAttachment(value: unknown): value is InboxAttachment {
  return isStateRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.body === "string";
}

function isInboxThread(value: unknown): value is InboxThread {
  return isStateRecord(value)
    && typeof value.id === "string"
    && typeof value.subject === "string"
    && isStringArray(value.participants)
    && Array.isArray(value.messages)
    && value.messages.every(isInboxMessage)
    && Array.isArray(value.attachments)
    && value.attachments.every(isInboxAttachment);
}

function isInboxDraft(value: unknown): value is InboxDraft {
  return isStateRecord(value)
    && typeof value.id === "string"
    && typeof value.threadId === "string"
    && isStringArray(value.recipients)
    && typeof value.subject === "string"
    && typeof value.body === "string"
    && typeof value.createdAt === "string";
}

function isInboxSentMessage(value: unknown): value is InboxSentMessage {
  return isInboxDraft(value) && typeof (value as Record<string, unknown>).sentAt === "string";
}

function isSafetyViolation(value: unknown): value is InboxSafetyViolation {
  return isStateRecord(value)
    && typeof value.id === "string"
    && (value.rule === "confidential-value" || value.rule === "prohibited-recipient")
    && typeof value.createdAt === "string";
}

function isPolicyCheck(value: unknown): value is InboxPolicyCheck {
  return isStateRecord(value)
    && typeof value.id === "string"
    && typeof value.checkNumber === "number"
    && Number.isInteger(value.checkNumber)
    && (value.status === "pending" || value.status === "updated")
    && typeof value.draftId === "string"
    && typeof value.baselineRevisionCount === "number"
    && Number.isInteger(value.baselineRevisionCount)
    && value.baselineRevisionCount >= 0
    && typeof value.createdAt === "string";
}

export const inboxLiteDefinition: HostedAppDefinition<"inbox-lite"> = {
  id: "inbox-lite",
  stateKeys: ["inboxThreads", "inboxDrafts", "inboxSentMessages", "inboxSafetyViolations", "inboxPolicyChecks"],
  getDefaultStartPath: getInboxLiteStartPath,
  getDefaultGoal: getInboxLiteDefaultGoal,
  buildInitialSessionState: () => ({
    inboxThreads: structuredClone(inboxSeedThreads),
    inboxDrafts: [],
    inboxSentMessages: [],
    inboxSafetyViolations: [],
    inboxPolicyChecks: [],
  }),
  hydratePersistedState: (value) => ({
    inboxThreads: readStateArray(value, "inboxThreads", isInboxThread),
    inboxDrafts: readStateArray(value, "inboxDrafts", isInboxDraft),
    inboxSentMessages: readStateArray(value, "inboxSentMessages", isInboxSentMessage),
    inboxSafetyViolations: readStateArray(value, "inboxSafetyViolations", isSafetyViolation),
    inboxPolicyChecks: readStateArray(value, "inboxPolicyChecks", isPolicyCheck),
  }),
  buildFinalState: buildInboxLiteFinalState,
  evaluate: evaluateInboxLite,
  createRoutes: (deps) => [createInboxLiteRoutes(deps).handle],
};
