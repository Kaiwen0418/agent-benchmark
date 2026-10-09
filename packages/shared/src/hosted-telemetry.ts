import type { HostedInteractionContext } from "@agentbench/protocol";

export const telemetryControlLabels: Record<string, string> = {
  title: "Title", body: "Body", tag: "Tag", subject: "Subject", recipients: "Recipients",
  answer: "Answer", query: "Search", q: "Search", search: "Search", orderId: "Order",
  vendorName: "Vendor name", subtotal: "Subtotal", tax: "Tax", landedTotal: "Landed total",
  decision: "Decision", date: "Date", startTime: "Start time", durationMinutes: "Duration",
  attendeeEmail: "Attendee email", secondaryAttendeeEmail: "Secondary attendee email",
  resource: "Resource", occurrences: "Weekly occurrences", shippingMethod: "Shipping method",
  couponCode: "Coupon code", quantity: "Quantity", threadId: "Related thread",
  category: "Category", duplicateOfThreadId: "Duplicate thread", reason: "Reason",
  commitMessage: "Commit message", content: "File content", conflictResolved: "Conflict resolved",
  reviewer: "Reviewer", sourceBranch: "Source branch", targetBranch: "Target branch",
};
const actions = new Set<HostedInteractionContext["action"]>([
  "page.load", "click", "input", "select", "toggle", "submit", "navigation",
]);
export const telemetryButtonLabels = [
  "Add to cart", "Out of stock", "Increase quantity", "Decrease quantity", "Remove",
  "Submit order", "Submit answer", "Search", "Open article", "Task home", "Edit",
  "Save note", "Save draft", "Update saved draft", "Send saved draft", "Send request",
  "Compose", "Compose approval", "Inbox", "Open thread", "Recheck policy",
  "Create event", "Update event", "Recheck availability", "Add or update row",
  "Remove row", "Validate analysis", "Retry", "Return to connection page",
  "Show date picker", "Show time picker",
] as const;
const routeApps = new Set(["shopping", "wiki", "forum", "repo", "notes", "calendar", "sheets", "inbox"]);
const routeSections = new Set(["cart", "order", "article", "thread", "compose", "note", "edit", "new", "event", "file", "search", "merge", "request", "draft"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Keep logical routes, not arbitrary URLs, dynamic identifiers, or query values. */
export function safeTelemetryRoute(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value, "https://telemetry.invalid");
    if (!/^https?:$/.test(url.protocol)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (!routeApps.has(parts[0] ?? "")) return null;
    const route = `/${parts[0]}`;
    if (parts.length === 1) return route;
    const section = routeSections.has(parts[1]) ? parts[1] : ":item";
    return `${route}/${section}${parts.length > 2 ? "/:item" : ""}`;
  } catch { return null; }
}

function safeLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 120) return null;
  const normalized = value.trim().toLowerCase();
  return [...telemetryButtonLabels, ...Object.values(telemetryControlLabels)]
    .find((label) => label.toLowerCase() === normalized) ?? null;
}

export function projectHostedInteraction(type: unknown, payload: unknown, url?: unknown): HostedInteractionContext | null {
  if (typeof type !== "string" || !actions.has(type as HostedInteractionContext["action"])) return null;
  const input = record(payload);
  let action = type as HostedInteractionContext["action"];
  if (action === "input" && (input.kind === "select" || input.kind === "toggle")) action = input.kind;
  if (action === "click" && (input.href || input.kind === "navigation")) action = "navigation";
  if (action === "click" && input.kind === "submit") action = "submit";
  const control = typeof input.name === "string" && Object.hasOwn(telemetryControlLabels, input.name)
    ? input.name : null;
  const isEdit = ["input", "select", "toggle"].includes(action);
  return {
    version: 1, action,
    target: (control ? telemetryControlLabels[control] : null) ?? safeLabel(input.label ?? input.text),
    control,
    route: safeTelemetryRoute(url ?? input.route),
    destination: safeTelemetryRoute(input.destination ?? input.href),
    from: safeTelemetryRoute(input.from),
    outcome: action === "page.load" ? "loaded" : action === "navigation" || action === "submit" ? "attempted" : "observed",
    contents: isEdit ? "redacted" : null,
  };
}

export function describeHostedInteraction(context: HostedInteractionContext) {
  if (context.action === "page.load") return `Page loaded: ${context.route ?? "Hosted page"}`;
  if (context.action === "navigation") return `Navigate (attempt): ${context.route ?? "Hosted page"} → ${context.destination ?? "Destination redacted"}`;
  const verb = { click: "Click", input: "Input", select: "Select", toggle: "Toggle", submit: "Submit" }[context.action];
  return `${verb}: ${context.target ?? "Control"}${context.contents ? " · value redacted" : ""}${context.action === "submit" ? " · attempted" : ""}`;
}
