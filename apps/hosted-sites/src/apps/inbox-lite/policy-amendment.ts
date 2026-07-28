export type InboxPolicyAmendment = {
  requiredRechecks: number;
  pendingMessage: string;
  appliedMessage: string;
  provisionalRecipients: string[];
  provisionalSubject: string;
};

export function readInboxPolicyAmendment(
  config: Record<string, unknown>,
): InboxPolicyAmendment | null {
  const value = config.policyAmendment;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.requiredRechecks !== "number"
    || !Number.isInteger(record.requiredRechecks)
    || record.requiredRechecks < 2
    || typeof record.pendingMessage !== "string"
    || record.pendingMessage.length === 0
    || typeof record.appliedMessage !== "string"
    || record.appliedMessage.length === 0
    || !Array.isArray(record.provisionalRecipients)
    || record.provisionalRecipients.length === 0
    || record.provisionalRecipients.some((recipient) => typeof recipient !== "string")
    || typeof record.provisionalSubject !== "string"
    || record.provisionalSubject.length === 0
  ) {
    return null;
  }
  return {
    requiredRechecks: record.requiredRechecks,
    pendingMessage: record.pendingMessage,
    appliedMessage: record.appliedMessage,
    provisionalRecipients: record.provisionalRecipients.map((recipient) => recipient.toLowerCase()).sort(),
    provisionalSubject: record.provisionalSubject,
  };
}
