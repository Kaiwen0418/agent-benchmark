import type { WikiArticle } from "./types.js";

export const wikiSeedArticles: WikiArticle[] = [
  {
    slug: "shipping-policy",
    title: "Shipping Policy",
    summary: "AgentBench warehouse dispatch schedule and standard delivery notes.",
    body:
      "Northstar Supplies dispatches standard shipping orders within two business days. Express orders ship same day before 3pm.",
  },
  {
    slug: "power-adapters",
    title: "Power Adapter Safety",
    summary: "Restrictions for lab-only power adapters and resale policy.",
    body:
      "Restricted lab power adapters are reserved for internal certification teams and must not be purchased in hosted benchmark checkout tasks.",
  },
  {
    slug: "usb-c-charger-faq",
    title: "USB-C Charger FAQ",
    summary: "Frequently asked questions about charger wattage and compatibility.",
    body:
      "The VoltEdge 30W USB-C Charger costs $24.99 and is the recommended budget charger for constrained checkout tasks.",
  },
  {
    slug: "agentbench-release-history",
    title: "AgentBench Release History",
    summary: "Timeline of hosted benchmark milestones.",
    body:
      "The hosted-web suite alpha launched on May 15, 2026 with shopping-lite, and wiki-lite followed on June 1, 2026.",
  },
];

export function getWikiStartPath() {
  return "/wiki";
}

export function getWikiDefaultGoal() {
  return "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the date exactly as written.";
}
