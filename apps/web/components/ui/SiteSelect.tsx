"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SiteSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  compact?: boolean;
};

export function SiteSelect({ className, compact = false, children, ...props }: SiteSelectProps) {
  return (
    <span className="relative block">
      <select
        {...props}
        className={cn(
          "w-full appearance-none rounded-[0.6rem] border border-[#d8d1c4] bg-white pr-10 text-sm text-[#111111] outline-none transition",
          "focus:border-[#111111] disabled:cursor-not-allowed disabled:bg-[#eeeae2] disabled:text-[#777168]",
          compact ? "px-3.5 py-2.5" : "px-3.5 py-3",
          className,
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#665f54]"
      >
        <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
