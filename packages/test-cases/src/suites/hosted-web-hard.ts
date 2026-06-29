import { hostedTestcaseApps } from "../generated-app-registry.js";
import { hostedSuiteMetadataSchema } from "../schemas.js";

// TODO(#114): replace the remaining default pools with hard-specific
// variant pools. shopping-lite (#110), wiki-lite (#111), forum-lite (#112), and
// calendar-lite (#113) use dedicated hard pools; repo-lite and notes-lite still
// reuse easy-suite pools as placeholders.
const shoppingQuestionVariants = hostedTestcaseApps["shopping-lite"].variantPools.hard;
const forumQuestionVariants = hostedTestcaseApps["forum-lite"].variantPools.hard;
const repoQuestionVariants = hostedTestcaseApps["repo-lite"].variantPools.default;
const wikiHardQuestionVariants = hostedTestcaseApps["wiki-lite"].variantPools.hard;
const notesQuestionVariants = hostedTestcaseApps["notes-lite"].variantPools.default;
const calendarQuestionVariants = hostedTestcaseApps["calendar-lite"].variantPools.hard;

export const hostedWebHardSuiteMetadata = hostedSuiteMetadataSchema.parse({
  suiteSlug: "hosted-web-hard-suite-v1",
  suiteVersion: "v1.0.0",
  sessions: [
    {
      app: "shopping-lite",
      taskSlug: "shopping-constrained-checkout-hard",
      title: "Shopping Checkout (Hard)",
      startPath: "/shopping",
      taskVersion: "v2",
      seedVersion: "shopping-lite-hard-v1",
      sequenceIndex: 0,
      weight: 1,
      required: true,
      metadata: { questionVariants: shoppingQuestionVariants },
    },
    {
      app: "forum-lite",
      taskSlug: "forum-battery-moderation-hard",
      title: "Forum Moderation (Hard)",
      startPath: "/forum",
      taskVersion: "v2",
      seedVersion: "forum-lite-hard-v1",
      sequenceIndex: 1,
      weight: 1,
      required: true,
      metadata: { questionVariants: forumQuestionVariants },
    },
    {
      app: "repo-lite",
      taskSlug: "repo-readme-fix-hard",
      title: "Repository README Fix (Hard)",
      startPath: "/repo",
      taskVersion: "v2",
      seedVersion: "repo-lite-hard-v1",
      sequenceIndex: 2,
      weight: 1,
      required: true,
      metadata: { questionVariants: repoQuestionVariants },
    },
    {
      app: "wiki-lite",
      taskSlug: "wiki-release-answer-hard",
      title: "Wiki Release Lookup (Hard)",
      startPath: "/wiki",
      taskVersion: "v3",
      seedVersion: "wiki-lite-hard-v1",
      sequenceIndex: 3,
      weight: 1,
      required: true,
      metadata: { questionVariants: wikiHardQuestionVariants },
    },
    {
      app: "wiki-lite",
      taskSlug: "wiki-policy-answer-hard",
      title: "Wiki Policy Lookup (Hard)",
      startPath: "/wiki",
      taskVersion: "v2",
      seedVersion: "wiki-lite-hard-v1",
      sequenceIndex: 4,
      weight: 1,
      required: true,
      metadata: { questionVariants: wikiHardQuestionVariants },
    },
    {
      app: "notes-lite",
      taskSlug: "notes-followup-create-hard",
      title: "Notes Follow-up (Hard)",
      startPath: "/notes",
      taskVersion: "v2",
      seedVersion: "notes-lite-hard-v1",
      sequenceIndex: 5,
      weight: 1,
      required: true,
      metadata: { questionVariants: notesQuestionVariants },
    },
    {
      app: "calendar-lite",
      taskSlug: "calendar-event-create-hard",
      title: "Calendar Event (Hard)",
      startPath: "/calendar",
      taskVersion: "v2",
      seedVersion: "calendar-lite-hard-v1",
      sequenceIndex: 6,
      weight: 1,
      required: true,
      metadata: { questionVariants: calendarQuestionVariants },
    },
  ],
});

export const hostedWebHardSuiteRevision = "hosted-web-hard-suite-v1.0.0";

export const hostedWebHardSuiteCase = {
  id: "bb7e5cd4-f3ed-4aa0-9fcc-46fec39997eb",
  slug: "hosted-web-hard-suite",
  title: "Hosted Web Hard Suite",
  description: "Run the published deterministic hosted-web hard benchmark suite.",
  category: "browser",
  difficulty: "hard",
  provider: "hosted-web" as const,
  metadata: {},
  isPublic: true,
};
