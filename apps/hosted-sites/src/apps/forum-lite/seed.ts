import type { ForumThread, ModerationAction } from "./types.js";

export const forumSeedThreads: ForumThread[] = [
  {
    id: "thr-battery",
    title: "Battery swelling issue after firmware update",
    category: "safety",
    posts: [
      {
        id: "p-battery-1",
        author: "user123",
        body: "My device started swelling after the latest firmware update. Has anyone else seen this?",
      },
      {
        id: "p-battery-2",
        author: "tech_support",
        body:
          "This is a known safety issue. Official recall link: https://support.example.com/recall/battery-2026. Please stop using the device immediately and follow the recall instructions.",
      },
    ],
  },
  {
    id: "thr-wifi",
    title: "WiFi connectivity drops on 5GHz",
    category: "networking",
    posts: [
      {
        id: "p-wifi-1",
        author: "netizen42",
        body: "My connection drops every 10 minutes on the 5GHz band. 2.4GHz is stable. Any fixes?",
      },
      {
        id: "p-wifi-2",
        author: "tech_support",
        body: "Use the official 5GHz reset guide: https://support.example.com/network/5ghz-reset before reopening the issue.",
      },
    ],
  },
  {
    id: "thr-screen",
    title: "Screen flickering in low brightness",
    category: "display",
    posts: [
      {
        id: "p-screen-1",
        author: "pixel_fan",
        body: "When I set brightness below 20%, the screen starts flickering. Is this a hardware defect?",
      },
      {
        id: "p-screen-2",
        author: "tech_support",
        body: "Follow the display calibration advisory: https://support.example.com/display/flicker-calibration and report the panel revision if it persists.",
      },
    ],
  },
];

export const forumSeedModerations: ModerationAction[] = [];

export function getForumStartPath() {
  return "/forum";
}

export function getForumDefaultGoal() {
  return "Find the thread about battery swelling, reply with the official recall link from the policy post, then lock the thread with reason 'safety escalation'.";
}
