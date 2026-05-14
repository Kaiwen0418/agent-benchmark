"use client";

import { useEffect, useRef } from "react";

const SCROLL_DURATION = 100;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getSnapSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("section[id], footer")).filter(
    (el) => el.offsetParent !== null,
  );
}

export function ScrollSnapController() {
  const lockedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const animateScrollTo = (targetY: number) => {
      if (lockedRef.current) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      const startY = window.scrollY;
      const distance = targetY - startY;
      if (Math.abs(distance) < 4) return;

      lockedRef.current = true;
      const start = performance.now();

      const step = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / SCROLL_DURATION, 1);
        window.scrollTo(0, startY + distance * easeInOut(progress));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          lockedRef.current = false;
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(step);
    };

    const getCurrentIndex = (sections: HTMLElement[]) => {
      const scrollMid = window.scrollY + window.innerHeight / 2;
      let idx = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= scrollMid) idx = i;
      }
      return idx;
    };

    const handleWheel = (e: WheelEvent) => {
      const sections = getSnapSections();
      if (!sections.length) return;

      if (lockedRef.current) {
        e.preventDefault();
        return;
      }

      const direction = e.deltaY > 0 ? 1 : -1;
      const currentIdx = getCurrentIndex(sections);
      const newIndex = Math.max(0, Math.min(sections.length - 1, currentIdx + direction));

      if (newIndex === currentIdx) return;

      e.preventDefault();
      animateScrollTo(sections[newIndex].offsetTop);
    };

    const handleAnchorClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#']");
      if (!anchor) return;
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector<HTMLElement>(hash);
      if (!target) return;
      e.preventDefault();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        lockedRef.current = false;
      }
      animateScrollTo(target.offsetTop);
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("click", handleAnchorClick);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      document.removeEventListener("click", handleAnchorClick);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return null;
}
