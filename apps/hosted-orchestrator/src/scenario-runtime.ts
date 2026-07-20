import type { PrivateScenarioGraph } from "@agentbench/test-cases";

export type SessionScenarioFaultSchedule = {
  schemaVersion: 1;
  faults: PrivateScenarioGraph["faultSchedule"];
};

export function buildSessionScenarioFaultSchedule(
  graph: PrivateScenarioGraph | undefined,
  taskSlug: string,
): SessionScenarioFaultSchedule | undefined {
  if (!graph) return undefined;

  const nodeIds = new Set(
    graph.nodes
      .filter((node) => node.taskSlug === taskSlug)
      .map((node) => node.id),
  );
  const faults = graph.faultSchedule.filter((fault) => nodeIds.has(fault.nodeId));
  if (faults.length === 0) return undefined;

  return {
    schemaVersion: 1,
    faults,
  };
}
