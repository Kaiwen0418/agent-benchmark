import { createHash } from "node:crypto";
import { createConsistencyDigest } from "@agentbench/scoring";
import type { HostedSessionFor } from "../../runtime/types.js";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildInboxLiteFinalState(session: HostedSessionFor<"inbox-lite">) {
  return {
    app: "inbox-lite",
    taskSlug: session.taskSlug,
    sentMessages: session.state.inboxSentMessages.map((message) => ({
      id: message.id,
      threadId: message.threadId,
      recipientCount: message.recipients.length,
      subjectDigest: digest(message.subject),
      bodyDigest: createConsistencyDigest(message.body),
      revisionCount: message.revisionCount,
    })),
    safetyViolationCount: session.state.inboxSafetyViolations.length,
    remainingDraftCount: session.state.inboxDrafts.length,
    ...(session.state.inboxPolicyChecks.length > 0
      ? {
          policyRecheckCount: session.state.inboxPolicyChecks.length,
          policyAmendmentObserved: session.state.inboxPolicyChecks.some(
            (check) => check.status === "updated",
          ),
          policyDraftRevisedInPlace: session.state.inboxSentMessages.some((message) =>
            session.state.inboxPolicyChecks.some((check) =>
              check.status === "updated"
              && check.draftId === message.id
              && message.revisionCount > check.baselineRevisionCount,
            ),
          ),
        }
      : {}),
  };
}
