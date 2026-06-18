"use client";

import { useEffect, useState } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function TopNav() {
  const items = [
    { href: "#leaderboard", label: "Leaderboard" },
    { href: "#docs", label: "Docs" },
  ];
  const [visibleProgress, setVisibleProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const playground = Array.from(document.querySelectorAll<HTMLElement>("#playground")).find(
        (element) => element.offsetParent !== null,
      );
      if (!playground) {
        return;
      }

      const rect = playground.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const start = viewportHeight * 0.9;
      const end = viewportHeight * 0.5;
      const next = clamp((start - rect.top) / (start - end), 0, 1);
      setVisibleProgress(next);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <nav
      className="fixed inset-x-0 top-0 z-50 border-b border-[#dbd3c5]/80 bg-[#f7f4ec]/90 backdrop-blur transition-[opacity,transform] duration-300"
      style={{
        opacity: visibleProgress,
        transform: `translateY(${(1 - visibleProgress) * -14}px)`,
        pointerEvents: visibleProgress > 0.05 ? "auto" : "none",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10 lg:px-16">
        <a href="#hero" className="text-sm font-medium uppercase tracking-[0.22em] text-[#111111]">
          AgentBench
        </a>
        <div className="hidden items-center gap-6 text-sm text-[#5f594e] md:flex">
          {items.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
          <a
            href="#playground"
            className="rounded-full bg-[#111111] px-5 py-2.5 text-sm text-white transition hover:bg-[#d7ff00] hover:text-[#111111]"
          >
            Start Run
          </a>
        </div>
      </div>
    </nav>
  );
}
