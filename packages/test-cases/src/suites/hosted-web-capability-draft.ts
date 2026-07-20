import type {
  CapabilityScoreDimension,
} from "../capability-benchmark.js";
import { hostedTestcaseApps } from "../generated-app-registry.js";
import { hostedSuiteMetadataSchema } from "../schemas.js";

const wikiVariants = hostedTestcaseApps["wiki-lite"].variantPools.hard;
const sheetsVariants = hostedTestcaseApps["sheets-lite"].variantPools.hard;
const shoppingVariants = hostedTestcaseApps["shopping-lite"].variantPools.hard;
const inboxVariants = hostedTestcaseApps["inbox-lite"].variantPools.campaign;
const notesVariants = hostedTestcaseApps["notes-lite"].variantPools.hard;
const calendarVariants = hostedTestcaseApps["calendar-lite"].variantPools.campaign;

type Variant = { id: string };

function coverage(params: {
  taskSlug: string;
  variants: readonly Variant[];
  capabilityIds: string[];
  dimensionIds: CapabilityScoreDimension[];
  preferredMaxActions: number;
  hardMaxActions: number;
}) {
  return params.variants.map((variant) => ({
    taskSlug: params.taskSlug,
    variantId: variant.id,
    capabilityIds: params.capabilityIds,
    dimensionIds: params.dimensionIds,
    interactionBudget: {
      preferredMaxActions: params.preferredMaxActions,
      hardMaxActions: params.hardMaxActions,
    },
  }));
}

const finalAndCost: CapabilityScoreDimension[] = [
  "final-state-correctness",
  "interaction-cost",
];

// This manifest is intentionally exported for validation and calibration but
// omitted from suites/registry.ts. It cannot be published or seeded until the
// campaign exit criteria are met and its immutable release identity is frozen.
export const hostedWebCapabilityDraftMetadata = hostedSuiteMetadataSchema.parse({
  suiteSlug: "hosted-web-capability-suite-v1-draft",
  suiteVersion: "unreleased",
  timeLimitMinutesPerTestcase: 10,
  sessions: [
    {
      app: "wiki-lite",
      taskSlug: "capability-wiki-release-research",
      title: "Release Evidence Reconciliation",
      startPath: "/wiki",
      taskVersion: "draft-v1",
      seedVersion: "wiki-lite-hard-v2",
      sequenceIndex: 0,
      weight: 1,
      required: true,
      metadata: { questionVariants: wikiVariants },
    },
    {
      app: "wiki-lite",
      taskSlug: "capability-wiki-policy-research",
      title: "Policy Evidence Reconciliation",
      startPath: "/wiki",
      taskVersion: "draft-v1",
      seedVersion: "wiki-lite-hard-v2",
      sequenceIndex: 1,
      weight: 1,
      required: true,
      metadata: { questionVariants: wikiVariants },
    },
    {
      app: "sheets-lite",
      taskSlug: "capability-procurement-analysis",
      title: "Procurement Analysis",
      startPath: "/sheets",
      taskVersion: "draft-v1",
      seedVersion: "sheets-lite-v1",
      sequenceIndex: 2,
      weight: 1,
      required: true,
      metadata: { questionVariants: sheetsVariants },
    },
    {
      app: "shopping-lite",
      taskSlug: "capability-constrained-purchase",
      title: "Constrained Purchase",
      startPath: "/shopping",
      taskVersion: "draft-v1",
      seedVersion: "shopping-lite-hard-v2",
      sequenceIndex: 3,
      weight: 1,
      required: true,
      metadata: { questionVariants: shoppingVariants },
    },
    {
      app: "inbox-lite",
      taskSlug: "capability-policy-revision-message",
      title: "Policy Revision Message",
      startPath: "/inbox",
      taskVersion: "draft-v1",
      seedVersion: "inbox-lite-v1",
      sequenceIndex: 4,
      weight: 1,
      required: true,
      metadata: { questionVariants: inboxVariants },
    },
    {
      app: "notes-lite",
      taskSlug: "capability-evidence-handoff",
      title: "Evidence Handoff",
      startPath: "/notes",
      taskVersion: "draft-v1",
      seedVersion: "notes-lite-hard-v3",
      sequenceIndex: 5,
      weight: 1,
      required: true,
      metadata: { questionVariants: notesVariants },
    },
    {
      app: "calendar-lite",
      taskSlug: "capability-coordinated-schedule",
      title: "Coordinated Schedule",
      startPath: "/calendar",
      taskVersion: "draft-v1",
      seedVersion: "calendar-lite-campaign-v1",
      sequenceIndex: 6,
      weight: 1,
      required: true,
      metadata: { questionVariants: calendarVariants },
    },
  ],
  consistencyChecks: [
    {
      name: "Release evidence carried into handoff title",
      sourceTaskSlug: "capability-wiki-release-research",
      sourcePath: "latestAnswer.answer",
      targetTaskSlug: "capability-evidence-handoff",
      targetPath: "notes[].title",
      rule: "equal-normalized",
    },
    {
      name: "Policy evidence carried into revision message",
      sourceTaskSlug: "capability-wiki-policy-research",
      sourcePath: "latestAnswer.answer",
      targetTaskSlug: "capability-policy-revision-message",
      targetPath: "sentMessages[].bodyDigest",
      rule: "target-digest-matches-source",
    },
    {
      name: "Policy evidence carried into handoff body",
      sourceTaskSlug: "capability-wiki-policy-research",
      sourcePath: "latestAnswer.answer",
      targetTaskSlug: "capability-evidence-handoff",
      targetPath: "notes[].bodyDigest",
      rule: "target-digest-matches-source",
    },
    {
      name: "Handoff title carried into coordinated schedule",
      sourceTaskSlug: "capability-evidence-handoff",
      sourcePath: "notes[].title",
      targetTaskSlug: "capability-coordinated-schedule",
      targetPath: "calendarEvents[].title",
      rule: "equal-normalized",
    },
  ],
  capabilityMatrix: {
    schemaVersion: 1,
    capabilities: [
      { id: "research-evidence", title: "Research and evidence reconciliation" },
      { id: "transaction-quantitative", title: "Transaction and quantitative reasoning" },
      { id: "communication-privacy", title: "Communication, policy, and privacy" },
      { id: "coordination", title: "Scheduling and multi-actor coordination" },
      { id: "recovery-self-correction", title: "Recovery and self-correction" },
      { id: "long-horizon-planning", title: "Long-horizon campaign planning" },
    ],
    dimensions: [
      { id: "final-state-correctness", weight: 0.6 },
      { id: "dependency-consistency", weight: 0.15 },
      { id: "evidence-verification", weight: 0.1 },
      { id: "recovery-safety", weight: 0.1 },
      { id: "interaction-cost", weight: 0.05, required: false },
    ],
    coverage: [
      ...coverage({
        taskSlug: "capability-wiki-release-research",
        variants: wikiVariants,
        capabilityIds: ["research-evidence", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "evidence-verification"],
        preferredMaxActions: 12,
        hardMaxActions: 24,
      }),
      ...coverage({
        taskSlug: "capability-wiki-policy-research",
        variants: wikiVariants,
        capabilityIds: ["research-evidence", "communication-privacy", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "evidence-verification"],
        preferredMaxActions: 12,
        hardMaxActions: 24,
      }),
      ...coverage({
        taskSlug: "capability-procurement-analysis",
        variants: sheetsVariants,
        capabilityIds: ["transaction-quantitative", "recovery-self-correction", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "evidence-verification", "recovery-safety"],
        preferredMaxActions: 18,
        hardMaxActions: 36,
      }),
      ...coverage({
        taskSlug: "capability-constrained-purchase",
        variants: shoppingVariants,
        capabilityIds: ["transaction-quantitative", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "dependency-consistency"],
        preferredMaxActions: 14,
        hardMaxActions: 28,
      }),
      ...coverage({
        taskSlug: "capability-policy-revision-message",
        variants: inboxVariants,
        capabilityIds: ["communication-privacy", "recovery-self-correction", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "dependency-consistency", "recovery-safety"],
        preferredMaxActions: 12,
        hardMaxActions: 24,
      }),
      ...coverage({
        taskSlug: "capability-evidence-handoff",
        variants: notesVariants,
        capabilityIds: ["communication-privacy", "coordination", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "dependency-consistency"],
        preferredMaxActions: 12,
        hardMaxActions: 24,
      }),
      ...coverage({
        taskSlug: "capability-coordinated-schedule",
        variants: calendarVariants,
        capabilityIds: ["coordination", "recovery-self-correction", "long-horizon-planning"],
        dimensionIds: [...finalAndCost, "dependency-consistency", "recovery-safety"],
        preferredMaxActions: 16,
        hardMaxActions: 32,
      }),
    ],
  },
  scenarioGraph: {
    schemaVersion: 1,
    nodes: [
      { id: "release-evidence", taskSlug: "capability-wiki-release-research", capabilityIds: ["research-evidence", "long-horizon-planning"] },
      { id: "policy-evidence", taskSlug: "capability-wiki-policy-research", capabilityIds: ["research-evidence", "communication-privacy", "long-horizon-planning"] },
      { id: "procurement-analysis", taskSlug: "capability-procurement-analysis", capabilityIds: ["transaction-quantitative", "recovery-self-correction", "long-horizon-planning"] },
      { id: "constrained-purchase", taskSlug: "capability-constrained-purchase", capabilityIds: ["transaction-quantitative", "long-horizon-planning"] },
      { id: "policy-revision-message", taskSlug: "capability-policy-revision-message", capabilityIds: ["communication-privacy", "recovery-self-correction", "long-horizon-planning"] },
      { id: "evidence-handoff", taskSlug: "capability-evidence-handoff", capabilityIds: ["communication-privacy", "coordination", "long-horizon-planning"] },
      { id: "coordinated-schedule", taskSlug: "capability-coordinated-schedule", capabilityIds: ["coordination", "recovery-self-correction", "long-horizon-planning"] },
      {
        id: "unrelated-inbox-detour",
        taskSlug: "capability-policy-revision-message",
        kind: "distractor",
        capabilityIds: ["communication-privacy", "long-horizon-planning"],
        avoidanceEvaluatorName: "optional unrelated thread untouched",
      },
    ],
    edges: [
      { id: "release-to-handoff", fromNodeId: "release-evidence", toNodeId: "evidence-handoff", relation: "informs" },
      { id: "policy-to-handoff", fromNodeId: "policy-evidence", toNodeId: "evidence-handoff", relation: "informs" },
      { id: "analysis-to-purchase", fromNodeId: "procurement-analysis", toNodeId: "constrained-purchase", relation: "requires" },
      { id: "policy-to-message-revision", fromNodeId: "policy-evidence", toNodeId: "policy-revision-message", relation: "revises", proofEvaluatorName: "policy revision observed and applied" },
      { id: "purchase-to-message", fromNodeId: "constrained-purchase", toNodeId: "policy-revision-message", relation: "requires" },
      { id: "handoff-to-schedule", fromNodeId: "evidence-handoff", toNodeId: "coordinated-schedule", relation: "informs" },
    ],
    faultSchedule: [
      { id: "stale-procurement-view", nodeId: "procurement-analysis", kind: "stale-view", trigger: { action: "read", occurrence: 2 } },
      { id: "rejected-policy-message", nodeId: "policy-revision-message", kind: "rejected-mutation", trigger: { action: "mutation", occurrence: 1 } },
      { id: "interrupted-calendar-navigation", nodeId: "coordinated-schedule", kind: "interrupted-navigation", trigger: { action: "navigation", occurrence: 2 } },
    ],
  },
});
