import type { RunEvent } from "@agentbench/protocol";
import { SectionCard } from "@/components/layout/SectionCard";

export function RunTimeline({ events }: { events: RunEvent[] }) {
  return (
    <SectionCard title="Run Timeline">
      <div className="space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-muted">No events yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">{event.type}</div>
                <div className="text-xs text-muted">{new Date(event.createdAt).toLocaleString()}</div>
              </div>
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
