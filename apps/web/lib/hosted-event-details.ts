import type { HostedInteractionContext } from "@agentbench/protocol";
import { projectHostedInteraction, describeHostedInteraction } from "@agentbench/shared/hosted-telemetry";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hostedInteractionContext(payload: Record<string, unknown>, eventType: string): HostedInteractionContext | null {
  const context = object(payload.interaction);
  const nested = object(payload.payload);
  const projected = projectHostedInteraction(
    eventType === "hosted.page.load" ? "page.load" : context.action ?? payload.type,
    Object.keys(context).length ? {
      name: context.control, label: context.target, destination: context.destination, from: context.from,
    } : nested,
    context.route ?? payload.url,
  );
  if (!projected) return null;
  const app = projected.route?.split("/")[1];
  const index = context.caseNumber ?? payload.sequenceIndex;
  const caseNumber = typeof index === "number" && Number.isInteger(index) && index >= 0 && index < 10000
    ? (context.caseNumber === undefined ? index + 1 : index) : undefined;
  return {
    ...projected,
    ...(app ? { app: `${app}-lite` } : {}),
    ...(caseNumber === undefined ? {} : { caseNumber }),
  };
}

export function publicBrowserEventPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (type !== "hosted.action" && type !== "hosted.page.load") return payload;
  const interaction = hostedInteractionContext(payload, type);
  return {
    type: typeof payload.type === "string" && /^(click|input|select|toggle|submit|navigation|page\.load)$/.test(payload.type) ? payload.type : "action",
    source: "hosted-sites",
    ...(typeof payload.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(payload.sessionId) ? { sessionId: payload.sessionId } : {}),
    ...(interaction ? { interaction, url: interaction.route, payload: { name: interaction.control, label: interaction.target } } : {}),
  };
}

export function hostedEventDescription(payload: Record<string, unknown>, type: string) {
  const context = hostedInteractionContext(payload, type);
  return context ? describeHostedInteraction(context) : "Hosted action (details unavailable)";
}
