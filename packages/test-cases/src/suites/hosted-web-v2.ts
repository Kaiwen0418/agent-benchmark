import { forumQuestionVariants } from "../apps/forum-lite.js";
import { notesQuestionVariants } from "../apps/notes-lite.js";
import { repoQuestionVariants } from "../apps/repo-lite.js";
import { shoppingQuestionVariants } from "../apps/shopping-lite.js";
import { wikiPolicyQuestionVariants, wikiQuestionVariants } from "../apps/wiki-lite.js";
import { hostedSuiteMetadataSchema } from "../schemas.js";

export const hostedWebSuiteMetadata = hostedSuiteMetadataSchema.parse({
  suiteSlug: "hosted-web-suite-v1",
  suiteVersion: "v3.0.1",
  sessions: [
    { app: "shopping-lite", taskSlug: "shopping-constrained-checkout", title: "Shopping Checkout", taskVersion: "v1", seedVersion: "shopping-lite-v1", sequenceIndex: 0, weight: 1, required: true, metadata: { questionVariants: shoppingQuestionVariants } },
    { app: "forum-lite", taskSlug: "forum-battery-moderation", title: "Forum Moderation", startPath: "/forum", taskVersion: "v1", seedVersion: "forum-lite-v1", sequenceIndex: 1, weight: 1, required: true, metadata: { questionVariants: forumQuestionVariants } },
    { app: "repo-lite", taskSlug: "repo-readme-fix", title: "Repository README Fix", startPath: "/repo", taskVersion: "v1", seedVersion: "repo-lite-v1", sequenceIndex: 2, weight: 1, required: true, metadata: { questionVariants: repoQuestionVariants } },
    { app: "wiki-lite", taskSlug: "wiki-release-answer", title: "Wiki Release Lookup", startPath: "/wiki", taskVersion: "v2", seedVersion: "wiki-lite-v2", sequenceIndex: 3, weight: 1, required: true, metadata: { questionVariants: wikiQuestionVariants } },
    { app: "wiki-lite", taskSlug: "wiki-policy-answer", title: "Wiki Policy Lookup", startPath: "/wiki", taskVersion: "v1", seedVersion: "wiki-lite-v3", sequenceIndex: 4, weight: 1, required: true, metadata: { questionVariants: wikiPolicyQuestionVariants } },
    { app: "notes-lite", taskSlug: "notes-followup-create", title: "Notes Follow-up", startPath: "/notes", taskVersion: "v1", seedVersion: "notes-lite-v1", sequenceIndex: 5, weight: 1, required: true, metadata: { questionVariants: notesQuestionVariants } },
  ],
});

export const hostedWebSuiteRevision = "hosted-web-suite-v3.0.1";

export const hostedWebSuiteCase = {
  id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
  slug: "hosted-web-suite",
  title: "Hosted Web Suite",
  description: "Run a six-step hosted suite across shopping-lite, forum-lite, repo-lite, wiki-lite, and notes-lite.",
  category: "browser",
  difficulty: "easy",
  provider: "hosted-web" as const,
  metadata: {},
  isPublic: true,
};
