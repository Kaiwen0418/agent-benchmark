export type InboxPolicyAmendment = {
  requiredRechecks: number;
  pendingMessage: string;
  appliedMessage: string;
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
  ) {
    return null;
  }
  return {
    requiredRechecks: record.requiredRechecks,
    pendingMessage: record.pendingMessage,
    appliedMessage: record.appliedMessage,
  };
}
