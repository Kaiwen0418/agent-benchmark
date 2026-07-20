import { hostedTestcaseApps } from "../generated-app-registry.js";
import { hostedSuiteMetadataSchema } from "../schemas.js";

// All apps now use dedicated hard pools: shopping-lite (#110), forum-lite
// (#112), wiki-lite (#111), calendar-lite (#113), repo-lite (#114), and
// notes-lite (#115, the cross-app carry target).
const shoppingQuestionVariants = hostedTestcaseApps["shopping-lite"].variantPools.hard;
const forumQuestionVariants = hostedTestcaseApps["forum-lite"].variantPools.hard;
const repoQuestionVariants = hostedTestcaseApps["repo-lite"].variantPools.hard;
const wikiHardQuestionVariants = hostedTestcaseApps["wiki-lite"].variantPools.hard;
const notesQuestionVariants = hostedTestcaseApps["notes-lite"].variantPools.hard;
const calendarQuestionVariants = hostedTestcaseApps["calendar-lite"].variantPools.hard;

export const hostedWebHardSuiteMetadata = hostedSuiteMetadataSchema.parse({
  suiteSlug: "hosted-web-hard-suite-v1",
  suiteVersion: "v1.0.5",
  timeLimitMinutesPerTestcase: 10,
  sessions: [
    {
      app: "shopping-lite",
      taskSlug: "shopping-constrained-checkout-hard",
      title: "Shopping Checkout (Hard)",
      startPath: "/shopping",
      taskVersion: "v3",
      seedVersion: "shopping-lite-hard-v2",
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
      taskVersion: "v3",
      seedVersion: "forum-lite-hard-v2",
      sequenceIndex: 1,
      weight: 1,
      required: true,
      timeLimitMinutes: 10,
      metadata: { questionVariants: forumQuestionVariants },
    },
    {
      app: "repo-lite",
      taskSlug: "repo-coherent-edit-hard",
      title: "Repository Coherent Edit (Hard)",
      startPath: "/repo",
      taskVersion: "v3",
      seedVersion: "repo-lite-hard-v2",
      sequenceIndex: 2,
      weight: 1,
      required: true,
      timeLimitMinutes: 10,
      metadata: { questionVariants: repoQuestionVariants },
    },
    {
      app: "wiki-lite",
      taskSlug: "wiki-release-answer-hard",
      title: "Wiki Release Lookup (Hard)",
      startPath: "/wiki",
      taskVersion: "v4",
      seedVersion: "wiki-lite-hard-v2",
      sequenceIndex: 3,
      weight: 1,
      required: true,
      timeLimitMinutes: 10,
      metadata: { questionVariants: wikiHardQuestionVariants },
    },
    {
      app: "wiki-lite",
      taskSlug: "wiki-policy-answer-hard",
      title: "Wiki Policy Lookup (Hard)",
      startPath: "/wiki",
      taskVersion: "v3",
      seedVersion: "wiki-lite-hard-v2",
      sequenceIndex: 4,
      weight: 1,
      required: true,
      timeLimitMinutes: 10,
      metadata: { questionVariants: wikiHardQuestionVariants },
    },
    {
      app: "notes-lite",
      taskSlug: "notes-followup-create-hard",
      title: "Notes Follow-up (Hard)",
      startPath: "/notes",
      taskVersion: "v4",
      seedVersion: "notes-lite-hard-v3",
      sequenceIndex: 5,
      weight: 1,
      required: true,
      timeLimitMinutes: 10,
      metadata: { questionVariants: notesQuestionVariants },
    },
    {
      app: "calendar-lite",
      taskSlug: "calendar-event-create-hard",
      title: "Calendar Event (Hard)",
      startPath: "/calendar",
      taskVersion: "v3",
      seedVersion: "calendar-lite-hard-v2",
      sequenceIndex: 6,
      weight: 1,
      required: true,
      timeLimitMinutes: 10,
      metadata: { questionVariants: calendarQuestionVariants },
    },
  ],
  // The agent must carry two independently submitted wiki answers into distinct
  // note fields. Checks compare only the agent's own final states, never private
  // task config, so no hidden answer key is exposed.
  consistencyChecks: [
    {
      name: "Wiki release answer carried into note title",
      sourceTaskSlug: "wiki-release-answer-hard",
      sourcePath: "latestAnswer.answer",
      targetTaskSlug: "notes-followup-create-hard",
      targetPath: "notes[].title",
      rule: "equal-normalized",
      weight: 1,
      required: true,
    },
    {
      name: "Wiki policy answer carried into note body",
      sourceTaskSlug: "wiki-policy-answer-hard",
      sourcePath: "latestAnswer.answer",
      targetTaskSlug: "notes-followup-create-hard",
      targetPath: "notes[].bodyDigest",
      rule: "target-digest-matches-source",
      weight: 1,
      required: true,
    },
    {
      name: "Note title carried into calendar title",
      sourceTaskSlug: "notes-followup-create-hard",
      sourcePath: "notes[].title",
      targetTaskSlug: "calendar-event-create-hard",
      targetPath: "calendarEvents[].title",
      rule: "equal-normalized",
      weight: 1,
      required: true,
    },
  ],
});

export const hostedWebHardSuiteRevision = "hosted-web-hard-suite-v1.0.5";

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
