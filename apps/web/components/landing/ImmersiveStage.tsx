"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { HeroSection } from "./HeroSection";
import { LiveMacScreenContent } from "./LiveMacContainer";
import { PlaygroundSection } from "./PlaygroundSection";
import { HeroIntroScreenContent, HeroMacFrame } from "./HeroMacFrame";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ImmersiveStage() {
  const playgroundRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const target = playgroundRef.current;
      if (!target) {
        return;
      }

      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const transitionStart = viewportHeight * 0.92;
      const transitionEnd = viewportHeight * 0.26;
      const next = clamp(
        (transitionStart - rect.top) / (transitionStart - transitionEnd),
        0,
        1,
      );

      setProgress(next);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const screenTransitionProgress = clamp((progress - 0.42) / 0.32, 0, 1);
  const modelScale = 0.9 + progress * 0.14;
  const modelRotateY = -15 + progress * 15;
  const modelRotateX = 5 - progress * 5;
  const modelSceneStyle = {
    transform: `scale(1.42) rotateY(${modelRotateY}deg) rotateX(${modelRotateX}deg)`,
    "--mac-rotate-y": `${modelRotateY}deg`,
    "--mac-rotate-x": `${modelRotateX}deg`,
  } as CSSProperties;

  return (
    <>
      <div className="lg:hidden">
        <HeroSection sectionId="hero" />
      </div>
      <div className="lg:hidden">
        <PlaygroundSection sectionId="playground" />
      </div>

      <section className="hidden px-6 pb-16 pt-8 md:px-10 lg:block lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="relative z-10">
            <HeroSection embedded showDevice={false} sectionId="hero" />
            <div ref={playgroundRef}>
              <PlaygroundSection embedded showLivePreview={false} sectionId="playground" />
            </div>
          </div>

          <div className="relative z-30">
            <div className="sticky top-1/2 overflow-visible">
              <div className="relative flex -translate-y-1/2 justify-center overflow-visible">
                <div className="pointer-events-none flex justify-center overflow-visible">
                  <div
                    className="pointer-events-auto w-full max-w-[44rem]"
                    style={{
                      transform: `scale(${modelScale})`,
                      transformOrigin: "center center",
                      transition: "transform 180ms linear",
                    }}
                  >
                    <HeroMacFrame
                      sceneStyle={modelSceneStyle}
                      screenContent={
                        <div className="relative h-full">
                          <div
                            className="absolute inset-0"
                            style={{
                              opacity: 1 - screenTransitionProgress,
                              transition: "opacity 180ms linear",
                            }}
                          >
                            <HeroIntroScreenContent />
                          </div>
                          <div
                            className="absolute inset-0"
                            style={{
                              opacity: screenTransitionProgress,
                              transition: "opacity 180ms linear",
                            }}
                          >
                            <LiveMacScreenContent />
                          </div>
                        </div>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
