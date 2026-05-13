import type { Artifact } from "@agentbench/protocol";
import { SectionCard } from "@/components/layout/SectionCard";

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <SectionCard title="Artifacts">
      <div className="space-y-3">
        {artifacts.length === 0 ? (
          <p className="text-sm text-muted">No artifacts yet.</p>
        ) : (
          artifacts.map((artifact) => (
            <div key={artifact.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="font-medium">{artifact.type}</div>
              <div className="mt-1 text-xs text-muted">{artifact.url ?? artifact.storagePath ?? "-"}</div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
