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

  // --- Hard triage threads (#112). Distinct topics from the easy threads so
  // the easy lookups stay unambiguous. These exercise duplicate consolidation,
  // recategorization, and title cleanup. ---

  // Duplicate cluster: only the canonical thread carries the official fix link.
  {
    id: "thr-charge-main",
    title: "USB-C port stops charging after firmware 4.2",
    category: "hardware",
    posts: [
      {
        id: "p-charge-main-1",
        author: "dock_user",
        body: "After updating to firmware 4.2 the USB-C port no longer charges. Reproduced on two units.",
      },
      {
        id: "p-charge-main-2",
        author: "tech_support",
        body: "Confirmed regression. Apply the official fix: https://support.example.com/hardware/usb-c-charging-fix and reboot twice.",
      },
    ],
  },
  {
    id: "thr-charge-dup1",
    title: "Charging stopped working",
    category: "hardware",
    posts: [
      {
        id: "p-charge-dup1-1",
        author: "anon_owner",
        body: "My device just stopped charging. No idea why. Anyone else?",
      },
    ],
  },
  {
    id: "thr-charge-dup2",
    title: "Won't charge after the update",
    category: "general",
    posts: [
      {
        id: "p-charge-dup2-1",
        author: "weekend_dev",
        body: "Same thing here, stopped charging right after the latest update. Frustrating.",
      },
    ],
  },

  // Miscategorized safety thread filed under "general".
  {
    id: "thr-misfiled-safety",
    title: "Faint smoke smell from the wall adapter",
    category: "general",
    posts: [
      {
        id: "p-misfiled-1",
        author: "careful_user",
        body: "I noticed a faint smoke smell coming from the wall adapter during charging. Should I be worried?",
      },
      {
        id: "p-misfiled-2",
        author: "tech_support",
        body: "Stop using the adapter now. Follow the advisory: https://support.example.com/safety/adapter-smoke and request a replacement.",
      },
    ],
  },

  // Vague-title thread that must be renamed before closing.
  {
    id: "thr-vague-title",
    title: "Help??? urgent!!!",
    category: "networking",
    posts: [
      {
        id: "p-vague-1",
        author: "frantic_user",
        body: "wired connection keeps failing to resolve hostnames, please help fast",
      },
      {
        id: "p-vague-2",
        author: "tech_support",
        body: "This is a DNS issue on wired links. Apply the reset guide: https://support.example.com/network/dns-reset.",
      },
    ],
  },

  // Combined cluster: a miscategorized canonical plus a duplicate.
  {
    id: "thr-hot-main",
    title: "Battery very hot to touch during fast charge",
    category: "general",
    posts: [
      {
        id: "p-hot-main-1",
        author: "thermal_watch",
        body: "The battery becomes very hot during fast charging, almost too hot to hold. Is this safe?",
      },
      {
        id: "p-hot-main-2",
        author: "tech_support",
        body: "This is a safety concern. Follow the advisory: https://support.example.com/safety/fast-charge-heat and disable fast charge.",
      },
    ],
  },
  {
    id: "thr-hot-dup",
    title: "Phone gets hot when fast charging",
    category: "general",
    posts: [
      {
        id: "p-hot-dup-1",
        author: "commuter",
        body: "Mine also heats up a lot on fast charge. Seems like the same problem.",
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
