"use client";

import { usePlaygroundStore } from "@/lib/playground-store";

const tabs = [
  { value: "events", label: "Events" },
  { value: "files", label: "Files" },
  { value: "screenshots", label: "Screenshots" },
  { value: "score", label: "Score" },
] as const;

export function RunPanels() {
  const activeTab = usePlaygroundStore((state) => state.activeTab);
  const setActiveTab = usePlaygroundStore((state) => state.setActiveTab);
  const reasoning = usePlaygroundStore((state) => state.reasoning);
  const artifacts = usePlaygroundStore((state) => state.artifacts);
  const score = usePlaygroundStore((state) => state.score);
  const phase = usePlaygroundStore((state) => state.phase);

  return (
    <div className="rounded-[1.6rem] border border-[#d8d0c3] bg-[#f9f7f1] p-5 shadow-[0_14px_40px_rgba(17,17,17,0.05)]">
      <div className="mb-4 flex flex-wrap gap-2.5">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${
              activeTab === tab.value
                ? "bg-[#111111] text-white"
                : "bg-[#efede6] text-[#4f4a43]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "events" ? (
        <div className="space-y-3">
          {reasoning.length === 0 ? (
            <p className="text-sm text-[#6a655c]">Agent reasoning summary will appear here.</p>
          ) : (
            reasoning.map((line, index) => (
              <div key={`${line}-${index}`} className="rounded-[1rem] bg-[#efede6] p-3.5 text-sm text-[#4d473f]">
                {line}
              </div>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "files" ? (
        <div className="space-y-3">
          {artifacts.filter((artifact) => artifact.type === "file").length === 0 ? (
            <p className="text-sm text-[#6a655c]">Generated files will appear here.</p>
          ) : (
            artifacts
              .filter((artifact) => artifact.type === "file")
              .map((artifact) => (
                <div key={artifact.id} className="rounded-[1rem] bg-[#efede6] p-3.5 text-sm text-[#4d473f]">
                  {artifact.name}
                </div>
              ))
          )}
        </div>
      ) : null}

      {activeTab === "screenshots" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {artifacts.filter((artifact) => artifact.type === "screenshot").length === 0 ? (
            <p className="text-sm text-[#6a655c]">Screenshots will appear here after capture.</p>
          ) : (
            artifacts
              .filter((artifact) => artifact.type === "screenshot")
              .map((artifact) => (
                <div key={artifact.id} className="rounded-[1.1rem] bg-[#efede6] p-3.5">
                  <div className="h-36 rounded-[0.9rem] bg-white" />
                  <div className="mt-2.5 text-sm text-[#4d473f]">{artifact.name}</div>
                </div>
              ))
          )}
        </div>
      ) : null}

      {activeTab === "score" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.1rem] bg-[#d7ff00] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[#4b5520]">Success</div>
            <div className="mt-2.5 text-3xl font-medium text-[#111111]">{score ?? "--"}</div>
          </div>
          <div className="rounded-[1.1rem] bg-[#efede6] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[#6a655c]">Safety</div>
            <div className="mt-2.5 text-lg text-[#111111]">
              {phase === "completed" ? "Boundary respected" : "Pending"}
            </div>
          </div>
          <div className="rounded-[1.1rem] bg-[#111111] p-4 text-white">
            <div className="text-xs uppercase tracking-[0.2em] text-white/60">Efficiency</div>
            <div className="mt-2.5 text-lg">{score ? `${Math.max(1, Math.round(score / 10))} steps` : "--"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
