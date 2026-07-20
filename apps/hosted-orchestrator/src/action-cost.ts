export type HostedActionEvent = {
  sessionId: string;
  type: string;
  payload: unknown;
};

const directActionTypes = new Set(["page.load", "navigation", "click", "submit"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inputFieldKey(payload: unknown) {
  if (!isRecord(payload)) return "input:unknown";
  const nestedPayload = isRecord(payload.payload) ? payload.payload : payload;
  const name = typeof nestedPayload.name === "string" && nestedPayload.name.length > 0
    ? nestedPayload.name
    : null;
  const tag = typeof nestedPayload.tag === "string" && nestedPayload.tag.length > 0
    ? nestedPayload.tag.toLowerCase()
    : "unknown";
  return `input:${name ?? tag}`;
}

/**
 * Count semantic browser actions from persisted telemetry. Repeated input
 * events for the same field are one edit burst; server and unknown events do
 * not affect the score or break a field edit burst.
 */
export function collectNormalizedActionCosts(events: HostedActionEvent[]) {
  const costs = new Map<string, number>();
  const activeInputFieldBySession = new Map<string, string | null>();

  for (const event of events) {
    if (!event.sessionId) continue;

    if (event.type === "input") {
      const fieldKey = inputFieldKey(event.payload);
      if (activeInputFieldBySession.get(event.sessionId) !== fieldKey) {
        costs.set(event.sessionId, (costs.get(event.sessionId) ?? 0) + 1);
      }
      activeInputFieldBySession.set(event.sessionId, fieldKey);
      continue;
    }

    if (!directActionTypes.has(event.type)) continue;
    costs.set(event.sessionId, (costs.get(event.sessionId) ?? 0) + 1);
    activeInputFieldBySession.set(event.sessionId, null);
  }

  return costs;
}
