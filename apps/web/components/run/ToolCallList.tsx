import type { RunEvent } from "@agentbench/protocol";
import { SectionCard } from "@/components/layout/SectionCard";

export function ToolCallList({ events }: { events: RunEvent[] }) {
  const toolEvents = events.filter((event) => event.type === "tool.call" || event.type === "tool.result");

  return (
    <SectionCard title="Tool Calls">
      <div className="space-y-3">
        {toolEvents.length === 0 ? (
          <p className="text-sm text-muted">Tool events will appear here.</p>
        ) : (
          toolEvents.map((event) => (
            <div key={event.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="font-medium">{event.type}</div>
              <pre className="mt-2 overflow-x-auto text-xs text-muted">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
