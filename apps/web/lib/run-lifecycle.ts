import type { RunStatus } from "@agentbench/protocol";

export const completableRunStatuses = [
  "queued",
  "waiting_for_agent",
  "agent_connected",
  "starting",
  "running",
  "scoring",
] as const satisfies readonly RunStatus[];

export const terminalRunStatuses = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
  "timeout",
]);
