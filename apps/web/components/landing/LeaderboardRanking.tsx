"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/db";
import { LEADERBOARD_MAX_ENTRIES, LEADERBOARD_PAGE_SIZE, paginateLeaderboard } from "@/lib/leaderboard-pagination";
import { SiteSelect } from "@/components/ui/SiteSelect";

export type LeaderboardBoard = {
  version: string;
  tag: string;
  slug: string;
  entries: LeaderboardEntry[];
};

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "--";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function boardValue(board: LeaderboardBoard) {
  return board.version === "all" ? "all" : `${board.slug}:${board.version}`;
}

function tagColor(tag: string) {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = tag.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    background: `hsla(${hue}, 75%, 55%, 0.15)`,
    text: `hsl(${hue}, 75%, 55%)`,
  };
}

function SuiteTag({ tag, compact = false }: { tag: string; compact?: boolean }) {
  const colors = tagColor(tag);
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${compact ? "text-[9px]" : "text-[10px]"}`}
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      {tag}
    </span>
  );
}

function SuiteLabel({ board }: { board: LeaderboardBoard }) {
  if (board.version === "all") {
    return <span>All versions</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <SuiteTag tag={board.tag} compact />
      <span>{board.version}</span>
    </span>
  );
}

function PlaceholderRow({ position }: { position: number }) {
  return (
    <div className="grid min-h-[84px] grid-cols-[38px_minmax(0,1fr)_52px_64px] items-center gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 lg:min-h-0 lg:grid-cols-[64px_1.35fr_1.2fr_0.75fr_96px] lg:gap-4 lg:px-6 lg:py-6">
      <span className="text-xl text-white/20 lg:text-2xl">{position.toString().padStart(2, "0")}</span>
      <div className="col-span-2 lg:col-span-3">
        <div className="h-2.5 w-28 rounded-full bg-white/[0.07] lg:h-3 lg:w-36" />
        <div className="mt-2 truncate text-[10px] uppercase tracking-[0.14em] text-white/25 lg:mt-3 lg:text-xs lg:tracking-[0.16em]">
          Awaiting benchmark result
        </div>
      </div>
      <div className="text-right text-xl text-white/15 lg:text-2xl">--</div>
    </div>
  );
}

export function LeaderboardRanking({ boards }: { boards: LeaderboardBoard[] }) {
  const defaultBoard = boards[0];
  const [activeVersion, setActiveVersion] = useState(boardValue(defaultBoard) ?? "all");
  const [page, setPage] = useState(1);
  const latestBoard = boards[0];
  const otherBoards = boards.slice(1);
  const activeBoard = boards.find((board) => boardValue(board) === activeVersion) ?? boards[0];
  const pagination = paginateLeaderboard(activeBoard?.entries ?? [], page);
  const { entries, page: currentPage, pageCount, pageEntries, placeholderPositions } = pagination;

  function selectVersion(version: string) {
    setActiveVersion(version);
    setPage(1);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2" aria-label="Benchmark version">
          {latestBoard ? (
            <button
              type="button"
              aria-pressed={boardValue(latestBoard) === activeVersion}
              onClick={() => selectVersion(boardValue(latestBoard))}
              className={boardValue(latestBoard) === activeVersion
                ? "rounded-[0.6rem] bg-[#111111] px-4 py-2.5 text-xs font-medium text-white"
                : "rounded-[0.6rem] border border-[#d8d0c2] bg-white/55 px-4 py-2.5 text-xs text-[#625c52] transition-colors hover:border-[#111111] hover:text-[#111111]"}
            >
              <SuiteLabel board={latestBoard} />
            </button>
          ) : null}
          {otherBoards.length > 0 ? (
            <SiteSelect
              compact
              ariaLabel="Other benchmark suites"
              value={otherBoards.some((board) => boardValue(board) === activeVersion) ? activeVersion : ""}
              onValueChange={selectVersion}
              options={[
                { value: "", label: "Other suites", disabled: true },
                ...otherBoards.map((board) => ({ value: boardValue(board), label: <SuiteLabel board={board} /> })),
              ]}
              className="min-w-[10rem]"
              triggerClassName="bg-white/55 py-2.5 text-xs text-[#625c52]"
            />
          ) : null}
        </div>
        <div className="text-xs uppercase tracking-[0.16em] text-[#8a8378]">
          Top {Math.min(entries.length, LEADERBOARD_MAX_ENTRIES)} · {LEADERBOARD_PAGE_SIZE} per page
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-[#d8d0c2] bg-[#111111] shadow-[0_32px_90px_rgba(77,63,36,0.16)] lg:rounded-[2rem]">
        <div className="hidden grid-cols-[64px_1.35fr_1.2fr_0.75fr_96px] gap-4 border-b border-white/10 px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-white/40 lg:grid">
          <span>Rank</span>
          <span>Agent</span>
          <span>Platform</span>
          <span>Duration</span>
          <span className="text-right">Score</span>
        </div>

        <div role="tabpanel">
          {pageEntries.map((entry) => (
            <a
              key={entry.runId}
              href={`/results/${entry.runId}`}
              className="group grid min-h-[84px] grid-cols-[38px_minmax(0,1fr)_52px_64px] items-center gap-3 border-b border-white/10 px-4 py-4 transition-colors last:border-b-0 hover:bg-white/[0.045] lg:min-h-0 lg:grid-cols-[64px_1.35fr_1.2fr_0.75fr_96px] lg:gap-4 lg:px-6 lg:py-6"
            >
              <span className={entry.rank <= 3 ? "text-xl font-medium text-[#d7ff00] lg:text-3xl" : "text-xl text-white/45 lg:text-2xl"}>
                {entry.rank.toString().padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white lg:text-lg">{entry.agentName}</div>
                <div className="mt-1 truncate text-[11px] text-white/45 lg:text-xs">
                  <span>{entry.baseModel}</span>
                  <span className="lg:hidden"> · {entry.browser ?? "Unknown browser"} / {entry.platform ?? "Unknown platform"}</span>
                </div>
                {entry.status === "timeout" ? (
                  <div className="mt-2 inline-flex rounded-full bg-[#ffb627]/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[#ffc44d]">
                    Timed out
                  </div>
                ) : entry.status === "failed" ? (
                  <div className="mt-2 inline-flex rounded-full bg-[#ff8d7a]/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[#ff9f90]">
                    Failed run
                  </div>
                ) : null}
              </div>
              <div className="hidden min-w-0 lg:block">
                <div className="truncate text-sm text-white/85">{entry.browser ?? "Unknown browser"}</div>
                <div className="mt-1 truncate text-xs text-white/40">{entry.platform ?? "Unknown platform"}</div>
              </div>
              <div className="min-w-0 text-sm font-medium text-white/85 lg:text-base">{formatDuration(entry.durationMs)}</div>
              <div className="text-right">
                <span className={`text-2xl font-medium tracking-[-0.04em] lg:text-3xl ${
                  entry.status === "failed"
                    ? "text-[#ff9f90]"
                    : entry.status === "timeout"
                      ? "text-[#ffc44d]"
                      : "text-white group-hover:text-[#d7ff00]"
                }`}>
                  {Math.round(entry.score * 100)}
                </span>
                <span className="ml-0.5 text-[10px] text-white/35 lg:ml-1 lg:text-xs">%</span>
              </div>
            </a>
          ))}
          {placeholderPositions.map((position) => <PlaceholderRow key={position} position={position} />)}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#777064]">
          {entries.length === 0
            ? "No published results for this benchmark version yet."
            : `Showing ${(currentPage - 1) * LEADERBOARD_PAGE_SIZE + 1}-${Math.min(currentPage * LEADERBOARD_PAGE_SIZE, entries.length)} of ${entries.length}`}
        </p>
        <div className="flex items-center gap-2" aria-label="Leaderboard pagination">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-full border border-[#d8d0c2] bg-white/55 px-3 py-2 text-xs text-[#403b33] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <span className="hidden sm:inline">Previous</span>
            <span className="sm:hidden">Prev</span>
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              aria-current={pageNumber === currentPage ? "page" : undefined}
              onClick={() => setPage(pageNumber)}
              className={pageNumber === currentPage
                ? "h-8 w-8 rounded-full bg-[#d7ff00] text-xs font-medium text-[#111111]"
                : "h-8 w-8 rounded-full border border-[#d8d0c2] bg-white/55 text-xs text-[#625c52]"}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            className="rounded-full border border-[#d8d0c2] bg-white/55 px-3 py-2 text-xs text-[#403b33] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
