"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

const heroLines = [
  "Agent task_01: PASS. Latency: 142ms.",
  "browser.goto(mock://workspace/search)",
  "Tool trace captured. Scoring candidate...",
  "Replay stored. Next scenario primed.",
];

const keyRows = Array.from({ length: 30 });

type HeroMacFrameProps = {
  sceneStyle?: CSSProperties;
  screenContent?: ReactNode;
};

export function HeroIntroScreenContent() {
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const fullText = heroLines[lineIndex];
    let cursor = 0;

    const interval = window.setInterval(() => {
      cursor += 1;
      setTyped(fullText.slice(0, cursor));
      if (cursor >= fullText.length) {
        window.clearInterval(interval);
        window.setTimeout(() => {
          setTyped("");
          setLineIndex((prev) => (prev + 1) % heroLines.length);
        }, 1500);
      }
    }, 38);

    return () => window.clearInterval(interval);
  }, [lineIndex]);

  return (
    <div className="mac-crt-ui">
      <div className="mac-sidebar">
        <div className="mac-sidebar-item is-active">System</div>
        <div className="mac-sidebar-item">Disk A</div>
        <div className="mac-sidebar-item">Replay</div>
        <div className="mac-sidebar-item">Trace</div>
        <div className="mac-sidebar-item">Think</div>
      </div>
      <div className="mac-window-area">
        <div className="mac-os-label">AgentBench OS 1.0</div>
        <div className="mac-window">
          <div className="mac-window-header">
            <span>live-run.txt</span>
            <span>[x]</span>
          </div>
          <div className="mac-terminal-line">
            {typed}
            <span className="terminal-cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroMacFrame({ sceneStyle, screenContent }: HeroMacFrameProps) {
  return (
    <div className="hero-scene">
      <div className="mac-scene" style={sceneStyle}>
        <div className="mac-computer-unit">
          <div className="mac-face mac-front">
            <div className="mac-screen-inset">
              <div className="mac-crt">
                <div className="crt-scanlines" />
                <div className="mac-crt-content">
                  {screenContent ?? <HeroIntroScreenContent />}
                </div>
              </div>
            </div>
            <div className="mac-logo">A</div>
            <div className="mac-floppy-slot" />
            <div className="mac-sticker mac-sticker-yellow">1</div>
            <div className="mac-sticker mac-sticker-dark">2</div>
            <div className="mac-vents">
              {Array.from({ length: 8 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>
          <div className="mac-face mac-back" />
          <div className="mac-face mac-left" />
          <div className="mac-face mac-right" />
          <div className="mac-face mac-top" />
          <div className="mac-face mac-bottom" />
          <div className="mac-keyboard-assembly">
            <div className="mac-keyboard-tag">PLAYGROUND</div>
            <div className="mac-keyboard-base">
              <div className="mac-keys-grid">
                {keyRows.map((_, index) => (
                  <span
                    key={index}
                    className={`mac-key ${index === 12 || index === 21 ? "mac-key-wide" : ""} ${index === 26 ? "mac-key-space" : ""}`}
                  />
                ))}
              </div>
            </div>
            <div className="mac-kb-front" />
            <div className="mac-kb-back" />
            <div className="mac-kb-left" />
            <div className="mac-kb-right" />
            <div className="mac-kb-shadow" />
          </div>
        </div>
      </div>
    </div>
  );
}
