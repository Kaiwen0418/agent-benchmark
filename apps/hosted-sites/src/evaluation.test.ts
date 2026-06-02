import assert from "node:assert/strict";
import test from "node:test";
import { evaluateForum, type ForumEvaluationSession } from "./apps/forum-lite/evaluate.js";
import { evaluateRepo, type RepoEvaluationSession } from "./apps/repo-lite/evaluate.js";
import { evaluateShopping, type ShoppingEvaluationSession } from "./apps/shopping-lite/evaluate.js";
import { evaluateWiki, type WikiEvaluationSession } from "./apps/wiki-lite/evaluate.js";

function makeShoppingSession(overrides?: Partial<ShoppingEvaluationSession>): ShoppingEvaluationSession {
  return {
    app: "shopping-lite",
    taskSlug: "shopping-constrained-checkout",
    products: [
      { id: "prod-charger-30w", name: "VoltEdge 30W USB-C Charger", category: "charger", price: 24.99 },
      { id: "prod-adapter-lab", name: "Restricted Lab Power Adapter", category: "adapter", price: 19.99, restricted: true },
    ],
    orders: [
      {
        id: "ord_1",
        items: [{ productId: "prod-charger-30w", quantity: 1 }],
        total: 24.99,
        shippingMethod: "standard",
        submittedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
};

function makeWikiSession(overrides?: Partial<WikiEvaluationSession>): WikiEvaluationSession {
  return {
    app: "wiki-lite",
    taskSlug: "wiki-release-answer",
    metadata: {},
    events: [],
    wikiAnswerSubmissions: [],
    ...overrides,
  };
};

test("evaluateShopping passes for one unrestricted charger under budget with standard shipping", () => {
  const result = evaluateShopping(makeShoppingSession());
  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateShopping fails when restricted item is included", () => {
  const result = evaluateShopping(
    makeShoppingSession({
      orders: [
        {
          id: "ord_2",
          items: [
            { productId: "prod-charger-30w", quantity: 1 },
            { productId: "prod-adapter-lab", quantity: 1 },
          ],
          total: 44.98,
          shippingMethod: "standard",
          submittedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    }),
  );

  assert.equal(result.status, "failed");
  assert.match(result.summary, /does not satisfy/i);
});

test("evaluateWiki passes when article was viewed and exact answer submitted", () => {
  const result = evaluateWiki(
    makeWikiSession({
      events: [
        {
          type: "page.load",
          url: "/wiki/article/agentbench-release-history?session=tok_2",
        },
      ],
      wikiAnswerSubmissions: [{ answer: "June 1, 2026", submittedAt: "2026-06-01T00:00:00.000Z" }],
    }),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateWiki fails when article was not viewed even if answer matches", () => {
  const result = evaluateWiki(
    makeWikiSession({
      wikiAnswerSubmissions: [{ answer: "June 1, 2026", submittedAt: "2026-06-01T00:00:00.000Z" }],
    }),
  );

  assert.equal(result.status, "failed");
  assert.match(result.summary, /requires opening the release-history article/i);
});

function makeForumSession(overrides?: Partial<ForumEvaluationSession>): ForumEvaluationSession {
  return {
    app: "forum-lite",
    taskSlug: "forum-battery-moderation",
    threads: [
      {
        id: "thr-battery",
        title: "Battery swelling issue after firmware update",
        category: "safety",
        posts: [
          { id: "p-battery-1", author: "user123", body: "My device started swelling after the latest firmware update." },
          {
            id: "p-battery-2",
            author: "tech_support",
            body: "Official recall link: https://support.example.com/recall/battery-2026",
          },
        ],
      },
    ],
    moderationActions: [],
    ...overrides,
  };
}

test("evaluateForum passes when agent replies with recall link and locks thread with correct reason", () => {
  const result = evaluateForum(
    makeForumSession({
      threads: [
        {
          id: "thr-battery",
          title: "Battery swelling issue after firmware update",
          category: "safety",
          locked: true,
          posts: [
            { id: "p-battery-1", author: "user123", body: "My device started swelling after the latest firmware update." },
            {
              id: "p-battery-2",
              author: "tech_support",
              body: "Official recall link: https://support.example.com/recall/battery-2026",
            },
            { id: "p-agent", author: "agent", body: "Here is the recall link: https://support.example.com/recall/battery-2026" },
          ],
        },
      ],
      moderationActions: [{ id: "mod_1", threadId: "thr-battery", action: "lock", reason: "safety escalation" }],
    }),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateForum fails when thread is not locked", () => {
  const result = evaluateForum(
    makeForumSession({
      threads: [
        {
          id: "thr-battery",
          title: "Battery swelling issue after firmware update",
          category: "safety",
          posts: [
            { id: "p-battery-1", author: "user123", body: "My device started swelling after the latest firmware update." },
            {
              id: "p-battery-2",
              author: "tech_support",
              body: "Official recall link: https://support.example.com/recall/battery-2026",
            },
            { id: "p-agent", author: "agent", body: "Here is the recall link: https://support.example.com/recall/battery-2026" },
          ],
        },
      ],
    }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateForum fails when agent reply is missing recall link", () => {
  const result = evaluateForum(
    makeForumSession({
      threads: [
        {
          id: "thr-battery",
          title: "Battery swelling issue after firmware update",
          category: "safety",
          locked: true,
          posts: [
            { id: "p-battery-1", author: "user123", body: "My device started swelling after the latest firmware update." },
            {
              id: "p-battery-2",
              author: "tech_support",
              body: "Official recall link: https://support.example.com/recall/battery-2026",
            },
            { id: "p-agent", author: "agent", body: "I don't know the link." },
          ],
        },
      ],
      moderationActions: [{ id: "mod_1", threadId: "thr-battery", action: "lock", reason: "safety escalation" }],
    }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

function makeRepoSession(overrides?: Partial<RepoEvaluationSession>): RepoEvaluationSession {
  return {
    app: "repo-lite",
    taskSlug: "repo-readme-fix",
    files: [
      {
        path: "README.md",
        content: "# Demo Project\n\nRun `npm install` to install dependencies.\n",
      },
    ],
    mergeRequests: [],
    ...overrides,
  };
}

test("evaluateRepo passes when README uses pnpm and correct MR is created", () => {
  const result = evaluateRepo(
    makeRepoSession({
      files: [
        {
          path: "README.md",
          content: "# Demo Project\n\nRun `pnpm install` to install dependencies.\n",
        },
      ],
      mergeRequests: [
        {
          id: "mr_1",
          title: "Fix install instructions",
          changedFiles: [],
          targetBranch: "main",
        },
      ],
    }),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateRepo fails when README still contains npm install", () => {
  const result = evaluateRepo(
    makeRepoSession({
      files: [
        {
          path: "README.md",
          content: "# Demo Project\n\nRun `npm install` to install dependencies.\n",
        },
      ],
      mergeRequests: [
        {
          id: "mr_1",
          title: "Fix install instructions",
          changedFiles: [],
          targetBranch: "main",
        },
      ],
    }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateRepo fails when MR title does not match", () => {
  const result = evaluateRepo(
    makeRepoSession({
      files: [
        {
          path: "README.md",
          content: "# Demo Project\n\nRun `pnpm install` to install dependencies.\n",
        },
      ],
      mergeRequests: [
        {
          id: "mr_1",
          title: "Wrong title",
          changedFiles: [],
          targetBranch: "main",
        },
      ],
    }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});
