"use client";

import { useState } from "react";
import type { HostedSessionBreakdown } from "@/lib/hosted-scoring";
import { usePlaygroundStore } from "@/lib/playground-store";

type DetailTab = "checks" | "events";

export function RunDetailTabs() {
  const scoringSessions = usePlaygroundStore((state) => state.scoringSessions);
  const timeline = usePlaygroundStore((state) => state.timeline);
  const streamMode = usePlaygroundStore((state) => state.streamMode);
  const [activeTab, setActiveTab] = useState<DetailTab>("checks");
  const completedCheckCount = scoringSessions.reduce(
    (total, session) => total + session.evaluators.length,
    0,
  );

  return (
    <div className="mt-4 border-t border-[#e1dbd0] pt-4">
      <div role="tablist" aria-label="Run details" className="grid grid-cols-2 rounded-full bg-[#e9e5dc] p-1">
        <TabButton
          active={activeTab === "checks"}
          label="Completed Checks"
          count={completedCheckCount}
          onClick={() => setActiveTab("checks")}
        />
        <TabButton
          active={activeTab === "events"}
          label="Event Stream"
          status={streamMode === "sse" ? "Live" : streamMode === "polling" ? "Polling" : "Idle"}
          onClick={() => setActiveTab("events")}
        />
      </div>

      {activeTab === "checks" ? (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 scroll-panel">
          {scoringSessions.length > 0 ? (
            [...scoringSessions].reverse().map((session) => (
              <ScoreSession key={session.sessionId} session={session} />
            ))
          ) : (
            <EmptyDetail message="Completed evaluator checks will appear here as sessions are scored." />
          )}
        </div>
      ) : (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 scroll-panel">
          {timeline.length > 0 ? (
            [...timeline].slice(-10).reverse().map((entry) => (
              <div key={entry.id} className="rounded-[0.9rem] border border-[#e1dbd0] bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-[#292620]">{entry.label}</span>
                  <span className="shrink-0 text-[10px] text-[#8f897e]">{entry.timestamp}</span>
                </div>
                <div className="mt-1 truncate text-xs text-[#6a655c]">{entry.detail}</div>
              </div>
            ))
          ) : (
            <EmptyDetail message="Waiting for the connection page to emit its first event." />
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  status,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  status?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] transition ${
        active ? "bg-[#111111] text-white shadow-sm" : "text-[#6a655c] hover:text-[#111111]"
      }`}
    >
      <span className="truncate">{label}</span>
      {typeof count === "number" ? (
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-white/15" : "bg-white text-[#4d483f]"}`}>
          {count}
        </span>
      ) : null}
      {status ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${status === "Idle" ? "bg-[#8f897e]" : "bg-[#d7ff00]"}`} />
          {status}
        </span>
      ) : null}
    </button>
  );
}

function EmptyDetail({ message }: { message: string }) {
  return (
    <div className="rounded-[0.9rem] border border-dashed border-[#d8d1c4] bg-white/60 px-3 py-4 text-xs leading-5 text-[#7a7469]">
      {message}
    </div>
  );
}

function ScoreSession({ session }: { session: HostedSessionBreakdown }) {
  return (
    <div className="rounded-[1rem] border border-[#e2ddd3] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[#111111]">{session.taskSlug}</div>
          <div className="mt-1 text-xs text-[#6a655c]">{session.summary}</div>
        </div>
        <div className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
          session.status === "passed" ? "bg-[#e8f7ec] text-[#1f6b35]" : "bg-[#fff1ed] text-[#8a2d1f]"
        }`}>
          {Math.round(session.score * 100)}%
        </div>
      </div>
      {session.evaluators.length > 0 ? (
        <div className="mt-3 space-y-2">
          {session.evaluators.map((evaluator) => (
            <div key={`${evaluator.type}:${evaluator.name}`} className="flex items-start gap-2 text-xs leading-5">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                evaluator.status === "passed" ? "bg-[#4da66a]" : "bg-[#d45b45]"
              }`} />
              <div className="min-w-0">
                <div className="text-[#292620]">{evaluator.name}{evaluator.required ? "" : " (optional)"}</div>
                {evaluator.errorMessage ? <div className="text-[#8a4334]">{evaluator.errorMessage}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
