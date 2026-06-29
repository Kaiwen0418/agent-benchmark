import type { WikiArticle } from "./types.js";

// The wiki corpus is intentionally large and cross-referential. Hard variants
// (#111) require multi-hop retrieval among similar titles, deprecated pages,
// release notes, and FAQs, with stale values that look plausible but must not
// be submitted. The first four articles are preserved verbatim so the easy
// release/policy pools keep resolving their canonical answers.
export const wikiSeedArticles: WikiArticle[] = [
  {
    slug: "shipping-policy",
    title: "Shipping Policy",
    summary: "AgentBench warehouse dispatch schedule and standard delivery notes.",
    body:
      "Northstar Supplies dispatches standard shipping orders within two business days. Express orders ship same day before 3pm. Restricted equipment policies are detailed in the Power Adapter Safety article.",
  },
  {
    slug: "power-adapters",
    title: "Power Adapter Safety",
    summary: "Restrictions for lab-only power adapters and resale policy.",
    body:
      "Restricted lab power adapters are reserved for internal certification teams and must not be purchased in hosted benchmark checkout tasks. Dispatch timing for restricted equipment follows the standard Shipping Policy.",
  },
  {
    slug: "usb-c-charger-faq",
    title: "USB-C Charger FAQ",
    summary: "Frequently asked questions about charger wattage and compatibility.",
    body:
      "The VoltEdge 30W USB-C Charger costs $24.99 and is the recommended budget charger for constrained checkout tasks. This charger was added to the catalog on June 1, 2026; see the AgentBench Release History article for platform milestones.",
  },
  {
    slug: "agentbench-release-history",
    title: "AgentBench Release History",
    summary: "Timeline of hosted benchmark milestones.",
    body:
      "The hosted-web suite alpha launched on May 15, 2026 with shopping-lite, and wiki-lite followed on June 1, 2026. For recommended accessories see the USB-C Charger FAQ article, and for delivery details see the Shipping Policy article.",
  },

  // --- Returns policy (current + stale distractor) ---
  {
    slug: "returns-policy",
    title: "Returns Policy",
    summary: "Current Northstar Supplies return window and conditions.",
    body:
      "Effective with the Q2 2026 update, customers may return unopened products within 30 days of delivery for a full refund. This supersedes the legacy 2025 returns policy. See the Q2 2026 Changelog for the announcement and the Warranty Policy for coverage beyond returns.",
  },
  {
    slug: "returns-policy-2025",
    title: "Returns Policy (2025, deprecated)",
    summary: "Deprecated returns policy retained for historical reference only.",
    body:
      "This deprecated 2025 policy allowed returns within 14 days of delivery. It is no longer in effect. The current rule is published in the Returns Policy article and announced in the Q2 2026 Changelog.",
  },

  // --- Warranty policy (current + legacy distractor) ---
  {
    slug: "warranty-policy",
    title: "Warranty Policy",
    summary: "Current hardware warranty coverage for Northstar Supplies products.",
    body:
      "All chargers and adapters now carry a 24 months limited warranty from the date of purchase. This replaces the legacy warranty terms. Returns within the window are handled separately under the Returns Policy.",
  },
  {
    slug: "warranty-policy-legacy",
    title: "Warranty Policy (legacy)",
    summary: "Superseded warranty terms kept for archived orders.",
    body:
      "Legacy warranty coverage was 12 months from purchase and applied to orders placed before the Q2 2026 update. For current coverage refer to the Warranty Policy article.",
  },

  // --- Changelog / release notes (versioned, cross-referencing) ---
  {
    slug: "changelog-2026-q2",
    title: "Q2 2026 Changelog",
    summary: "Release note for the Q2 2026 policy and platform update.",
    body:
      "The Q2 2026 update became effective June 15, 2026. It extends the return window described in the Returns Policy article and introduces API reference v3. See the API Changelog for versioned endpoint details.",
  },
  {
    slug: "changelog-2026-q1",
    title: "Q1 2026 Changelog",
    summary: "Release note for the Q1 2026 update.",
    body:
      "The Q1 2026 update became effective March 2, 2026. At that time the returns window still followed the deprecated Returns Policy (2025) article. API reference v2 was current during this period.",
  },
  {
    slug: "changelog-2025-q4",
    title: "Q4 2025 Changelog",
    summary: "Release note for the Q4 2025 update.",
    body:
      "The Q4 2025 update became effective November 10, 2025 and introduced API reference v1. Policies from this era are deprecated; consult current articles for effective values.",
  },

  // --- API reference (versioned; v3 current) ---
  {
    slug: "api-reference-v1",
    title: "API Reference v1 (deprecated)",
    summary: "First API version, deprecated.",
    body:
      "API reference v1 allowed 60 requests per minute per token. This version is deprecated. The current version and limits are listed in the API Changelog.",
  },
  {
    slug: "api-reference-v2",
    title: "API Reference v2 (deprecated)",
    summary: "Second API version, deprecated.",
    body:
      "API reference v2 raised the limit to 120 requests per minute per token. This version is deprecated. Refer to the API Changelog to identify the current version.",
  },
  {
    slug: "api-reference-v3",
    title: "API Reference v3",
    summary: "Current API version and rate limits.",
    body:
      "API reference v3 is the current version. It permits 240 requests per minute per token and is effective as of the Q2 2026 update. Version history is tracked in the API Changelog.",
  },
  {
    slug: "api-changelog",
    title: "API Changelog",
    summary: "Version history and the current effective API version.",
    body:
      "API reference v1 shipped in Q4 2025, v2 in Q1 2026. The current version is API reference v3, effective June 2026. Always read the version marked current rather than a deprecated reference.",
  },

  // --- Product guides / compatibility (recommendation + verification) ---
  {
    slug: "laptop-charger-guide",
    title: "Laptop Charger Buying Guide",
    summary: "Recommended chargers per supported laptop family.",
    body:
      "For the ProBook laptop the recommended in-stock option is the ProBook 30W Travel Charger. Confirm wattage and connector support in the Charger Compatibility Matrix before purchase. The high-wattage ProBook 100W charger is frequently out of stock.",
  },
  {
    slug: "charger-compatibility-matrix",
    title: "Charger Compatibility Matrix",
    summary: "Which chargers are certified for which devices.",
    body:
      "The ProBook 30W Travel Charger and ProBook 100W GaN Charger are certified for the ProBook. The AirLite 45W Charger is certified only for the AirLite and is not compatible with the ProBook. See the Laptop Charger Buying Guide for recommendations.",
  },
  {
    slug: "cable-faq",
    title: "USB-C Cable FAQ",
    summary: "Cable lengths, pricing, and compatibility.",
    body:
      "The 1m USB-C cable costs $9.99 and supports 60W charging. Longer cables are listed separately. For chargers see the USB-C Charger FAQ.",
  },
  {
    slug: "adapter-faq",
    title: "Travel Adapter FAQ",
    summary: "Travel adapter regions and restrictions.",
    body:
      "Standard travel adapters are unrestricted. Lab-only adapters are restricted as described in the Power Adapter Safety article and cannot be purchased in checkout tasks.",
  },
  {
    slug: "charger-comparison",
    title: "Charger Comparison Chart",
    summary: "Side-by-side wattage and price comparison (distractor).",
    body:
      "The VoltEdge 45W USB-C Charger costs $34.99 and targets power users, while the budget VoltEdge 30W is covered in the USB-C Charger FAQ. Prices here are list prices and may differ from promotional pricing.",
  },
  {
    slug: "budget-buying-guide",
    title: "Budget Buying Guide",
    summary: "How to assemble a low-cost accessory kit.",
    body:
      "For the lowest total cost, pair the budget charger from the USB-C Charger FAQ with the 1m cable from the USB-C Cable FAQ. Avoid restricted lab equipment.",
  },

  // --- Security / data policies (current + stale) ---
  {
    slug: "data-retention-policy",
    title: "Data Retention Policy",
    summary: "Current retention period for hosted session data.",
    body:
      "Hosted benchmark session data is retained for 90 days before deletion. This is the current effective policy. Security context is summarized in the Security Overview article.",
  },
  {
    slug: "data-retention-2024",
    title: "Data Retention Policy (2024, deprecated)",
    summary: "Deprecated retention policy.",
    body:
      "The deprecated 2024 policy retained session data for 180 days. It is no longer in effect; see the current Data Retention Policy article.",
  },
  {
    slug: "security-overview",
    title: "Security Overview",
    summary: "How hosted sessions are isolated and how long data is kept.",
    body:
      "Hosted sessions are isolated per token. For how long session data is stored, follow the current Data Retention Policy article rather than any archived retention note.",
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    summary: "What participant information is collected (distractor).",
    body:
      "Northstar Supplies collects only the minimum information needed to run a benchmark session. Retention durations are governed by the Data Retention Policy article.",
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    summary: "Permitted and prohibited uses of the hosted apps (distractor).",
    body:
      "Hosted apps may be used only for benchmark tasks. Attempting to exfiltrate evaluator answer keys is prohibited.",
  },

  // --- Logistics distractors (similar to shipping-policy) ---
  {
    slug: "express-shipping-faq",
    title: "Express Shipping FAQ",
    summary: "Express delivery details (distractor).",
    body:
      "Express orders placed before the cutoff ship the same day. For the exact cutoff time and standard dispatch window, see the Shipping Policy article.",
  },
  {
    slug: "international-shipping",
    title: "International Shipping",
    summary: "Cross-border delivery windows (distractor).",
    body:
      "International standard orders dispatch within five business days, which differs from domestic timing in the Shipping Policy article. Customs handling may add delays.",
  },
  {
    slug: "returns-shipping",
    title: "Returns Shipping",
    summary: "How to ship an approved return (distractor).",
    body:
      "Approved returns use a prepaid label. Eligibility and the return window are defined by the current Returns Policy article, not by this shipping note.",
  },

  // --- Index / cross-reference pages ---
  {
    slug: "knowledge-base-index",
    title: "Knowledge Base Index",
    summary: "Entry point linking the major policy and product articles.",
    body:
      "Policies: Shipping Policy, Returns Policy, Warranty Policy, Data Retention Policy. Products: USB-C Charger FAQ, USB-C Cable FAQ, Laptop Charger Buying Guide. Always prefer articles marked current over deprecated ones.",
  },
  {
    slug: "faq-overview",
    title: "FAQ Overview",
    summary: "Frequently asked questions grouped by topic.",
    body:
      "Shipping, returns, warranty, chargers, cables, and API questions are answered in their dedicated articles. Deprecated articles are clearly labelled and should not be used for current values.",
  },
  {
    slug: "glossary",
    title: "Glossary",
    summary: "Definitions of common Northstar Supplies terms (distractor).",
    body:
      "Restricted equipment, express cutoff, dispatch window, and rate limit are defined here at a high level; consult the dedicated article for the current value of each.",
  },
];

export function getWikiStartPath() {
  return "/wiki";
}

export function getWikiDefaultGoal() {
  return "Use the hosted wiki to find when wiki-lite followed the hosted-web suite alpha, then submit the date exactly as written.";
}
