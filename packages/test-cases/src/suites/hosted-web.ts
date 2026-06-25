import { hostedTestcaseApps } from "../generated-app-registry.js";
import { hostedSuiteMetadataSchema } from "../schemas.js";

const shoppingQuestionVariants = hostedTestcaseApps["shopping-lite"].variantPools.default;
const forumQuestionVariants = hostedTestcaseApps["forum-lite"].variantPools.default;
const repoQuestionVariants = hostedTestcaseApps["repo-lite"].variantPools.default;
const wikiQuestionVariants = hostedTestcaseApps["wiki-lite"].variantPools.release;
const wikiPolicyQuestionVariants = hostedTestcaseApps["wiki-lite"].variantPools.policy;
const notesQuestionVariants = hostedTestcaseApps["notes-lite"].variantPools.default;
const calendarQuestionVariants = hostedTestcaseApps["calendar-lite"].variantPools.default;

export const hostedWebSuiteMetadata = hostedSuiteMetadataSchema.parse({
  suiteSlug: "hosted-web-suite-v1",
  suiteVersion: "v3.0.6",
  sessions: [
    { app: "shopping-lite", taskSlug: "shopping-constrained-checkout", title: "Shopping Checkout", taskVersion: "v2", seedVersion: "shopping-lite-v2", sequenceIndex: 0, weight: 1, required: true, metadata: { questionVariants: shoppingQuestionVariants } },
    { app: "forum-lite", taskSlug: "forum-battery-moderation", title: "Forum Moderation", startPath: "/forum", taskVersion: "v2", seedVersion: "forum-lite-v2", sequenceIndex: 1, weight: 1, required: true, metadata: { questionVariants: forumQuestionVariants } },
    { app: "repo-lite", taskSlug: "repo-readme-fix", title: "Repository README Fix", startPath: "/repo", taskVersion: "v2", seedVersion: "repo-lite-v2", sequenceIndex: 2, weight: 1, required: true, metadata: { questionVariants: repoQuestionVariants } },
    { app: "wiki-lite", taskSlug: "wiki-release-answer", title: "Wiki Release Lookup", startPath: "/wiki", taskVersion: "v3", seedVersion: "wiki-lite-v4", sequenceIndex: 3, weight: 1, required: true, metadata: { questionVariants: wikiQuestionVariants } },
    { app: "wiki-lite", taskSlug: "wiki-policy-answer", title: "Wiki Policy Lookup", startPath: "/wiki", taskVersion: "v2", seedVersion: "wiki-lite-v4", sequenceIndex: 4, weight: 1, required: true, metadata: { questionVariants: wikiPolicyQuestionVariants } },
    { app: "notes-lite", taskSlug: "notes-followup-create", title: "Notes Follow-up", startPath: "/notes", taskVersion: "v1", seedVersion: "notes-lite-v1", sequenceIndex: 5, weight: 1, required: true, metadata: { questionVariants: notesQuestionVariants } },
    { app: "calendar-lite", taskSlug: "calendar-event-create", title: "Calendar Event", startPath: "/calendar", taskVersion: "v1", seedVersion: "calendar-lite-v1", sequenceIndex: 6, weight: 1, required: true, metadata: { questionVariants: calendarQuestionVariants } },
  ],
});

export const hostedWebSuiteRevision = "hosted-web-suite-v3.0.6";

export const hostedWebSuiteCase = {
  id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
  slug: "hosted-web-suite",
  title: "Hosted Web Suite",
  description: "Run the published deterministic hosted-web benchmark suite.",
  category: "browser",
  difficulty: "easy",
  provider: "hosted-web" as const,
  metadata: {},
  isPublic: true,
};
