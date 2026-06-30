"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SiteSelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type SiteSelectProps = {
  value: string;
  options: SiteSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  triggerClassName?: string;
};

export function SiteSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  compact = false,
  className,
  triggerClassName,
}: SiteSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function selectOption(option: SiteSelectOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  }

  function moveActive(direction: 1 | -1) {
    let nextIndex = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        return;
      }
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (!open) {
            setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
          }
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            const option = options[activeIndex];
            if (option) selectOption(option);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-[0.6rem] border border-[#d8d1c4] bg-white text-left text-sm text-[#111111] outline-none transition",
          "focus:border-[#111111] disabled:cursor-not-allowed disabled:bg-[#eeeae2] disabled:text-[#777168]",
          compact ? "px-3.5 py-2.5" : "px-3.5 py-3",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-[#777168]")}>
          {selectedOption?.label ?? options.find((option) => option.disabled)?.label ?? "Select"}
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[#665f54]">
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-[calc(100%+0.35rem)] z-[80] min-w-full overflow-hidden rounded-[0.6rem] border border-[#cfc7b9] bg-[#fffdf8] p-1.5 shadow-[0_18px_45px_rgba(35,28,17,0.18)]"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={cn(
                  "flex w-full items-center rounded-[0.4rem] px-3 py-2 text-left text-xs transition-colors",
                  option.disabled
                    ? "cursor-default text-[#9a9388]"
                    : selected
                      ? "bg-[#111111] text-white"
                      : active
                        ? "bg-[#eee9df] text-[#111111]"
                        : "text-[#4f4940] hover:bg-[#eee9df]",
                )}
              >
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
