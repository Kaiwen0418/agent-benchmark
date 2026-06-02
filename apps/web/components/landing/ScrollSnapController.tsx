"use client";

import { useEffect, useRef } from "react";

const SNAP_IDLE_MS = 140;
const SNAP_DISTANCE_THRESHOLD = 120;

function getSnapSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("section[id], footer")).filter(
    (el) => el.offsetParent !== null,
  );
}

export function ScrollSnapController() {
  const snapTimeoutRef = useRef<number | null>(null);
  const suppressSnapRef = useRef(false);
  const lastDirectionRef = useRef<1 | -1>(1);

  useEffect(() => {
    const clearSnapTimeout = () => {
      if (snapTimeoutRef.current !== null) {
        window.clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = null;
      }
    };

    const isInsideScrollable = (target: EventTarget | null, deltaY: number): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== document.documentElement) {
        const { overflowY } = window.getComputedStyle(node);
        if (overflowY === "auto" || overflowY === "scroll") {
          const canScrollDown = deltaY > 0 && node.scrollTop < node.scrollHeight - node.clientHeight - 1;
          const canScrollUp = deltaY < 0 && node.scrollTop > 0;
          if (canScrollDown || canScrollUp) return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const getCurrentIndex = (sections: HTMLElement[]) => {
      const scrollMid = window.scrollY + window.innerHeight / 2;
      let idx = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= scrollMid) idx = i;
      }
      return idx;
    };

    const snapToSectionIfNeeded = () => {
      if (suppressSnapRef.current) {
        suppressSnapRef.current = false;
        return;
      }

      const sections = getSnapSections();
      if (!sections.length) return;

      const currentIdx = getCurrentIndex(sections);
      const currentSection = sections[currentIdx];
      const sectionTop = currentSection.offsetTop;
      const sectionBottom = sectionTop + currentSection.offsetHeight;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const direction = lastDirectionRef.current;

      let targetY: number | null = null;

      if (currentSection.offsetHeight <= window.innerHeight + SNAP_DISTANCE_THRESHOLD) {
        const distanceToTop = Math.abs(viewportTop - sectionTop);
        if (distanceToTop <= SNAP_DISTANCE_THRESHOLD) {
          targetY = sectionTop;
        } else {
          const nextSection = sections[currentIdx + 1];
          if (nextSection) {
            const distanceToNext = Math.abs(viewportTop - nextSection.offsetTop);
            if (distanceToNext <= SNAP_DISTANCE_THRESHOLD) {
              targetY = nextSection.offsetTop;
            }
          }
        }
      } else if (direction > 0) {
        const nextSection = sections[currentIdx + 1];
        if (nextSection && viewportBottom >= sectionBottom - SNAP_DISTANCE_THRESHOLD) {
          targetY = nextSection.offsetTop;
        }
      } else if (viewportTop <= sectionTop + SNAP_DISTANCE_THRESHOLD) {
        targetY = sectionTop;
      }

      if (targetY === null || Math.abs(window.scrollY - targetY) < 4) {
        return;
      }

      window.scrollTo({
        top: targetY,
        behavior: "smooth",
      });
    };

    const scheduleSnap = () => {
      clearSnapTimeout();
      snapTimeoutRef.current = window.setTimeout(snapToSectionIfNeeded, SNAP_IDLE_MS);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      lastDirectionRef.current = e.deltaY > 0 ? 1 : -1;
      suppressSnapRef.current = isInsideScrollable(e.target, e.deltaY);
      scheduleSnap();
    };

    const handleScroll = () => {
      scheduleSnap();
    };

    const handleAnchorClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#']");
      if (!anchor) return;
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector<HTMLElement>(hash);
      if (!target) return;
      e.preventDefault();
      clearSnapTimeout();
      window.scrollTo({
        top: target.offsetTop,
        behavior: "smooth",
      });
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("click", handleAnchorClick);

    return () => {
      clearSnapTimeout();
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("click", handleAnchorClick);
    };
  }, []);

  return null;
}
