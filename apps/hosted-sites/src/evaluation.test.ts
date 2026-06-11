import assert from "node:assert/strict";
import test from "node:test";
import { evaluateForum, type ForumEvaluationSession } from "./apps/forum-lite/evaluate.js";
import { evaluateRepo, type RepoEvaluationSession } from "./apps/repo-lite/evaluate.js";
import { evaluateShopping, type ShoppingEvaluationSession } from "./apps/shopping-lite/evaluate.js";
import { evaluateWiki, type WikiEvaluationSession } from "./apps/wiki-lite/evaluate.js";

function generatedTaskConfig(taskConfig: Record<string, unknown>) {
  return {
    questionGeneration: {
      schemaVersion: 1,
      generationSeed: "test-seed",
      variantId: "test-variant",
      taskConfig,
    },
  };
}

const defaultTaskConfigs = {
  shopping: generatedTaskConfig({
    targetCategory: "charger",
    quantity: 1,
    maxTotal: 30,
    shippingMethod: "standard",
    avoidRestricted: true,
  }),
  forum: generatedTaskConfig({
    targetThreadId: "thr-battery",
    expectedReplyValue: "https://support.example.com/recall/battery-2026",
    expectedLockReason: "safety escalation",
  }),
  repo: generatedTaskConfig({
    filePath: "README.md",
    expectedText: "pnpm install",
    forbiddenText: "npm install",
    expectedMrTitle: "Fix install instructions",
    expectedTargetBranch: "main",
  }),
};

function makeShoppingSession(
  overrides?: Partial<ShoppingEvaluationSession["state"]>,
): ShoppingEvaluationSession {
  return {
    app: "shopping-lite",
    taskSlug: "shopping-constrained-checkout",
    metadata: defaultTaskConfigs.shopping,
    state: {
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
    },
  };
}

function makeWikiSession(overrides?: {
  metadata?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  wikiAnswerSubmissions?: WikiEvaluationSession["state"]["wikiAnswerSubmissions"];
}): WikiEvaluationSession {
  return {
    app: "wiki-lite",
    taskSlug: "wiki-release-answer",
    metadata:
      overrides?.metadata ??
      generatedTaskConfig({ targetArticleSlug: "agentbench-release-history", expectedAnswer: "June 1, 2026" }),
    events: overrides?.events ?? [],
    state: {
      wikiAnswerSubmissions: overrides?.wikiAnswerSubmissions ?? [],
    },
  };
}

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
  assert.match(result.summary, /requires opening the generated target article/i);
});

function makeForumSession(
  overrides?: Partial<ForumEvaluationSession["state"]>,
): ForumEvaluationSession {
  return {
    app: "forum-lite",
    taskSlug: "forum-battery-moderation",
    metadata: defaultTaskConfigs.forum,
    state: {
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
    },
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

function makeRepoSession(
  overrides?: Partial<RepoEvaluationSession["state"]>,
): RepoEvaluationSession {
  return {
    app: "repo-lite",
    taskSlug: "repo-readme-fix",
    metadata: defaultTaskConfigs.repo,
    state: {
      files: [
        {
          path: "README.md",
          content: "# Demo Project\n\nRun `npm install` to install dependencies.\n",
        },
      ],
      mergeRequests: [],
      ...overrides,
    },
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

test("generated shopping config changes the accepted category and shipping method", () => {
  const session = makeShoppingSession({
    products: [{ id: "prod-cable", name: "USB-C Cable", category: "cable", price: 9.99 }],
    orders: [{
      id: "ord_cable",
      items: [{ productId: "prod-cable", quantity: 1 }],
      total: 9.99,
      shippingMethod: "express",
      submittedAt: "2026-06-01T00:00:00.000Z",
    }],
  });
  session.metadata = generatedTaskConfig({
    targetCategory: "cable",
    quantity: 1,
    maxTotal: 10,
    shippingMethod: "express",
    avoidRestricted: true,
  });
  assert.equal(evaluateShopping(session).status, "passed");
});

test("generated wiki config changes both the target article and answer", () => {
  const result = evaluateWiki(makeWikiSession({
    metadata: generatedTaskConfig({ targetArticleSlug: "shipping-policy", expectedAnswer: "two business days" }),
    events: [{ type: "page.load", url: "/wiki/article/shipping-policy?session=tok" }],
    wikiAnswerSubmissions: [{ answer: "two business days", submittedAt: "2026-06-01T00:00:00.000Z" }],
  }));
  assert.equal(result.status, "passed");
});

test("generated forum config changes the target thread, reply value, and lock reason", () => {
  const session = makeForumSession({
    threads: [{
      id: "thr-wifi",
      title: "WiFi connectivity drops on 5GHz",
      category: "networking",
      locked: true,
      posts: [{ id: "agent", author: "agent", body: "Use https://support.example.com/network/5ghz-reset" }],
    }],
    moderationActions: [{ id: "mod", threadId: "thr-wifi", action: "lock", reason: "resolved with guide" }],
  });
  session.metadata = generatedTaskConfig({
    targetThreadId: "thr-wifi",
    expectedReplyValue: "https://support.example.com/network/5ghz-reset",
    expectedLockReason: "resolved with guide",
  });
  assert.equal(evaluateForum(session).status, "passed");
});

test("generated repo config changes the replacement text and merge request", () => {
  const session = makeRepoSession({
    files: [{ path: "README.md", content: "Run `yarn install` to install dependencies.\n" }],
    mergeRequests: [{ id: "mr_yarn", title: "Document Yarn setup", changedFiles: [], targetBranch: "main" }],
  });
  session.metadata = generatedTaskConfig({
    filePath: "README.md",
    expectedText: "yarn install",
    forbiddenText: "npm install",
    expectedMrTitle: "Document Yarn setup",
    expectedTargetBranch: "main",
  });
  assert.equal(evaluateRepo(session).status, "passed");
});
