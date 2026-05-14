"use client";

import { useState } from "react";
import { usePlaygroundStore } from "@/lib/playground-store";

export function ToolCallTimeline() {
  const timeline = usePlaygroundStore((state) => state.timeline);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="max-w-[720px] rounded-[1.6rem] border border-[#d8d0c3] bg-[#121212] p-5 text-white shadow-[0_16px_40px_rgba(17,17,17,0.1)]">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mb-4 flex w-full items-center justify-between"
      >
        <span className="text-[11px] uppercase tracking-[0.22em] text-[#8f8a80]">Tool Call Timeline</span>
        <span className="flex items-center gap-2 text-[11px] text-[#8f8a80]">
          {timeline.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5">{timeline.length}</span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          >
            <path d="M2 4l4 4 4-4" stroke="#8f8a80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-3 font-mono text-sm">
          {timeline.length === 0 ? (
            <div className="rounded-[1rem] border border-white/10 bg-white/5 p-3.5 text-[#b5aea1]">
              Timeline will populate after the run starts.
            </div>
          ) : (
            timeline.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-3 rounded-[1rem] border border-white/10 bg-white/5 p-3.5 md:grid-cols-[0.8fr_1.2fr_0.4fr]"
              >
                <div>
                  <div className="text-[#f7f0e0]">{entry.label}</div>
                  <div className="mt-1 text-xs text-[#8f8a80]">{entry.timestamp}</div>
                </div>
                <div className="truncate text-[#c6bfae]">{entry.detail}</div>
                <div className="text-right">
                  <div className="text-[#8f8a80]">{entry.duration}</div>
                  <div
                    className={`mt-1 inline-flex rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                      entry.status === "success"
                        ? "bg-[#d7ff00] text-[#111111]"
                        : entry.status === "warning"
                          ? "bg-[#ffd24f] text-[#111111]"
                          : entry.status === "error"
                            ? "bg-[#ff8f6b] text-[#111111]"
                            : "bg-white/10 text-white"
                    }`}
                  >
                    {entry.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
