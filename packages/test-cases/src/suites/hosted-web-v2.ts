import { forumQuestionVariants } from "../apps/forum-lite.js";
import { repoQuestionVariants } from "../apps/repo-lite.js";
import { shoppingQuestionVariants } from "../apps/shopping-lite.js";
import { wikiQuestionVariants } from "../apps/wiki-lite.js";
import { hostedSuiteMetadataSchema } from "../schemas.js";

export const hostedWebSuiteMetadata = hostedSuiteMetadataSchema.parse({
  suiteSlug: "hosted-web-suite-v1",
  suiteVersion: "v2",
  sessions: [
    { app: "shopping-lite", taskSlug: "shopping-constrained-checkout", title: "Shopping Checkout", taskVersion: "v1", seedVersion: "shopping-lite-v1", sequenceIndex: 0, weight: 1, required: true, metadata: { questionVariants: shoppingQuestionVariants } },
    { app: "forum-lite", taskSlug: "forum-battery-moderation", title: "Forum Moderation", startPath: "/forum", taskVersion: "v1", seedVersion: "forum-lite-v1", sequenceIndex: 1, weight: 1, required: true, metadata: { questionVariants: forumQuestionVariants } },
    { app: "repo-lite", taskSlug: "repo-readme-fix", title: "Repository README Fix", startPath: "/repo", taskVersion: "v1", seedVersion: "repo-lite-v1", sequenceIndex: 2, weight: 1, required: true, metadata: { questionVariants: repoQuestionVariants } },
    { app: "wiki-lite", taskSlug: "wiki-release-answer", title: "Wiki Release Lookup", startPath: "/wiki", taskVersion: "v2", seedVersion: "wiki-lite-v2", sequenceIndex: 3, weight: 1, required: true, metadata: { questionVariants: wikiQuestionVariants } },
  ],
});

export const hostedWebSuiteRevision = "hosted-web-suite-v2";

export const hostedWebSuiteCase = {
  id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
  slug: "hosted-web-suite",
  title: "Hosted Web Suite",
  description: "Run a four-step hosted suite across shopping-lite, forum-lite, repo-lite, and wiki-lite.",
  category: "browser",
  difficulty: "easy",
  provider: "hosted-web" as const,
  metadata: {},
  isPublic: true,
};
