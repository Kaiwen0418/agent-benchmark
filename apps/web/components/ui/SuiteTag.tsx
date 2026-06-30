import type { ReactNode } from "react";

export function suiteTagHue(tag: string) {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = tag.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

export function SuiteTag({
  tag,
  compact = false,
  children,
}: {
  tag: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const hue = suiteTagHue(tag);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${compact ? "text-[9px]" : "text-[10px]"}`}
      style={{ backgroundColor: `hsl(${hue}, 78%, 55%)`, color: "#111111" }}
    >
      {children ?? tag}
    </span>
  );
}
