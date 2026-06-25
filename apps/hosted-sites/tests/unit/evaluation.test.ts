import assert from "node:assert/strict";
import test from "node:test";
import { evaluateForum, type ForumEvaluationSession } from "../../src/apps/forum-lite/evaluate.js";
import { evaluateNotes, type NotesEvaluationSession } from "../../src/apps/notes-lite/evaluate.js";
import { evaluateRepo, type RepoEvaluationSession } from "../../src/apps/repo-lite/evaluate.js";
import { evaluateShopping, type ShoppingEvaluationSession } from "../../src/apps/shopping-lite/evaluate.js";
import { evaluateWiki, type WikiEvaluationSession } from "../../src/apps/wiki-lite/evaluate.js";
import { wikiSeedArticles } from "../../src/apps/wiki-lite/seed.js";

function generatedTaskConfig(taskConfig: Record<string, unknown>, schemaVersion = 3) {
  return {
    questionGeneration: {
      schemaVersion,
      generationSeed: "test-seed",
      variantId: "test-variant",
      taskConfig,
    },
  };
}

function wikiTaskConfig(params: {
  targetArticleSlug: string;
  kind: "date" | "duration" | "currency";
  canonicalValue: string;
  normalization: "trim" | "trim-casefold" | "trim-casefold-punctuation";
}) {
  return generatedTaskConfig({
    targetArticleSlug: params.targetArticleSlug,
    answerContract: {
      kind: params.kind,
      canonicalValue: params.canonicalValue,
      normalization: params.normalization,
      sourceArticleSlug: params.targetArticleSlug,
    },
  });
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
  notes: generatedTaskConfig({
    expectedTitle: "Support follow-up",
    expectedBody: "Email Mira after the replacement adapter ships.",
    expectedTag: "support",
  }),
};

function makeShoppingSession(
  overrides?: Partial<ShoppingEvaluationSession["state"]>,
  metadata?: Record<string, unknown>,
): ShoppingEvaluationSession {
  return {
    app: "shopping-lite",
    taskSlug: "shopping-constrained-checkout",
    metadata: metadata ?? defaultTaskConfigs.shopping,
    state: {
      products: [
        { id: "prod-charger-20w", name: "VoltEdge 20W USB-C Charger", category: "charger", price: 18.99 },
        { id: "prod-charger-30w", name: "VoltEdge 30W USB-C Charger", category: "charger", price: 24.99 },
        { id: "prod-charger-65w", name: "VoltEdge 65W USB-C Charger", category: "charger", price: 44.99 },
        { id: "prod-cable-1m", name: "Braided USB-C Cable 1m", category: "cable", price: 9.99 },
        { id: "prod-cable-2m", name: "Braided USB-C Cable 2m", category: "cable", price: 14.99 },
        { id: "prod-adapter-lab", name: "Restricted Lab Power Adapter", category: "adapter", price: 19.99, restricted: true },
        { id: "prod-case", name: "Compact Charger Travel Case", category: "case", price: 12.5 },
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
  wikiArticles?: WikiEvaluationSession["state"]["wikiArticles"];
  wikiAnswerSubmissions?: WikiEvaluationSession["state"]["wikiAnswerSubmissions"];
}): WikiEvaluationSession {
  return {
    app: "wiki-lite",
    taskSlug: "wiki-release-answer",
    metadata:
      overrides?.metadata ??
      wikiTaskConfig({
        targetArticleSlug: "agentbench-release-history",
        kind: "date",
        canonicalValue: "June 1, 2026",
        normalization: "trim-casefold-punctuation",
      }),
    events: overrides?.events ?? [],
    state: {
      wikiArticles: overrides?.wikiArticles ?? wikiSeedArticles,
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

test("evaluateShopping passes for multi-item cart with secondary category", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        orders: [
          {
            id: "ord_combo",
            items: [
              { productId: "prod-charger-20w", quantity: 1 },
              { productId: "prod-cable-1m", quantity: 1 },
            ],
            subtotal: 28.98,
            total: 28.98,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 1,
        maxTotal: 35,
        shippingMethod: "standard",
        avoidRestricted: true,
        secondaryCategory: "cable",
        secondaryQuantity: 1,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateShopping fails when secondary category is missing", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        orders: [
          {
            id: "ord_single",
            items: [{ productId: "prod-charger-20w", quantity: 1 }],
            total: 18.99,
            shippingMethod: "standard",
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 1,
        maxTotal: 35,
        shippingMethod: "standard",
        avoidRestricted: true,
        secondaryCategory: "cable",
        secondaryQuantity: 1,
      }),
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateShopping passes with shipping threshold and free shipping", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        orders: [
          {
            id: "ord_shipping",
            items: [
              { productId: "prod-charger-30w", quantity: 1 },
              { productId: "prod-case", quantity: 1 },
            ],
            subtotal: 37.49,
            total: 37.49,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 1,
        maxTotal: 40,
        shippingMethod: "standard",
        avoidRestricted: true,
        secondaryCategory: "case",
        secondaryQuantity: 1,
        freeShippingThreshold: 35,
        shippingCost: 5,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateShopping passes with shipping threshold and paid shipping", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        orders: [
          {
            id: "ord_shipping",
            items: [
              { productId: "prod-charger-20w", quantity: 1 },
              { productId: "prod-case", quantity: 1 },
            ],
            subtotal: 31.49,
            total: 36.49,
            shippingMethod: "standard",
            shippingCost: 5,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 1,
        maxTotal: 40,
        shippingMethod: "standard",
        avoidRestricted: true,
        secondaryCategory: "case",
        secondaryQuantity: 1,
        freeShippingThreshold: 35,
        shippingCost: 5,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateShopping fails when paid shipping pushes total over budget", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        orders: [
          {
            id: "ord_shipping",
            items: [
              { productId: "prod-charger-20w", quantity: 1 },
              { productId: "prod-case", quantity: 1 },
            ],
            subtotal: 31.49,
            total: 36.49,
            shippingMethod: "standard",
            shippingCost: 5,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 1,
        maxTotal: 35,
        shippingMethod: "standard",
        avoidRestricted: true,
        secondaryCategory: "case",
        secondaryQuantity: 1,
        freeShippingThreshold: 35,
        shippingCost: 5,
      }),
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
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
  metadata?: Record<string, unknown>,
): ForumEvaluationSession {
  return {
    app: "forum-lite",
    taskSlug: "forum-battery-moderation",
    metadata: metadata ?? defaultTaskConfigs.forum,
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

test("evaluateForum passes when agent replies, locks, and pins the thread", () => {
  const result = evaluateForum(
    makeForumSession(
      {
        threads: [
          {
            id: "thr-battery",
            title: "Battery swelling issue after firmware update",
            category: "safety",
            locked: true,
            pinned: true,
            posts: [
              { id: "p-battery-1", author: "user123", body: "My device started swelling." },
              { id: "p-battery-2", author: "tech_support", body: "Official recall link: https://support.example.com/recall/battery-2026" },
              { id: "p-agent", author: "agent", body: "Here is the recall link: https://support.example.com/recall/battery-2026" },
            ],
          },
        ],
        moderationActions: [
          { id: "mod_1", threadId: "thr-battery", action: "lock", reason: "safety escalation" },
          { id: "mod_2", threadId: "thr-battery", action: "pin", reason: "safety escalation" },
        ],
      },
      generatedTaskConfig({
        targetThreadId: "thr-battery",
        expectedReplyValue: "https://support.example.com/recall/battery-2026",
        expectedLockReason: "safety escalation",
        requiresPin: true,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateForum fails when pin is required but missing", () => {
  const result = evaluateForum(
    makeForumSession(
      {
        threads: [
          {
            id: "thr-battery",
            title: "Battery swelling issue after firmware update",
            category: "safety",
            locked: true,
            posts: [
              { id: "p-battery-1", author: "user123", body: "My device started swelling." },
              { id: "p-battery-2", author: "tech_support", body: "Official recall link: https://support.example.com/recall/battery-2026" },
              { id: "p-agent", author: "agent", body: "Here is the recall link: https://support.example.com/recall/battery-2026" },
            ],
          },
        ],
        moderationActions: [{ id: "mod_1", threadId: "thr-battery", action: "lock", reason: "safety escalation" }],
      },
      generatedTaskConfig({
        targetThreadId: "thr-battery",
        expectedReplyValue: "https://support.example.com/recall/battery-2026",
        expectedLockReason: "safety escalation",
        requiresPin: true,
      }),
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateForum passes when agent reports, replies, and locks the thread", () => {
  const result = evaluateForum(
    makeForumSession(
      {
        threads: [
          {
            id: "thr-wifi",
            title: "WiFi connectivity drops on 5GHz",
            category: "networking",
            locked: true,
            posts: [
              { id: "p-wifi-1", author: "user123", body: "My 5GHz keeps dropping." },
              { id: "p-wifi-2", author: "tech_support", body: "Reset guide: https://support.example.com/network/5ghz-reset" },
              { id: "p-agent", author: "agent", body: "Use https://support.example.com/network/5ghz-reset" },
            ],
          },
        ],
        moderationActions: [
          { id: "mod_1", threadId: "thr-wifi", action: "report", reason: "needs escalation" },
          { id: "mod_2", threadId: "thr-wifi", action: "lock", reason: "resolved with guide" },
        ],
      },
      generatedTaskConfig({
        targetThreadId: "thr-wifi",
        expectedReplyValue: "https://support.example.com/network/5ghz-reset",
        expectedLockReason: "resolved with guide",
        requiresReport: true,
        expectedReportReason: "needs escalation",
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateForum fails when report is required but missing", () => {
  const result = evaluateForum(
    makeForumSession(
      {
        threads: [
          {
            id: "thr-wifi",
            title: "WiFi connectivity drops on 5GHz",
            category: "networking",
            locked: true,
            posts: [
              { id: "p-wifi-1", author: "user123", body: "My 5GHz keeps dropping." },
              { id: "p-wifi-2", author: "tech_support", body: "Reset guide: https://support.example.com/network/5ghz-reset" },
              { id: "p-agent", author: "agent", body: "Use https://support.example.com/network/5ghz-reset" },
            ],
          },
        ],
        moderationActions: [{ id: "mod_1", threadId: "thr-wifi", action: "lock", reason: "resolved with guide" }],
      },
      generatedTaskConfig({
        targetThreadId: "thr-wifi",
        expectedReplyValue: "https://support.example.com/network/5ghz-reset",
        expectedLockReason: "resolved with guide",
        requiresReport: true,
        expectedReportReason: "needs escalation",
      }),
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateForum passes when agent reports, replies, locks, and pins the thread", () => {
  const result = evaluateForum(
    makeForumSession(
      {
        threads: [
          {
            id: "thr-screen",
            title: "Screen flickering in low brightness",
            category: "display",
            locked: true,
            pinned: true,
            posts: [
              { id: "p-screen-1", author: "user123", body: "Screen flickers at low brightness." },
              { id: "p-screen-2", author: "tech_support", body: "Calibration advisory: https://support.example.com/display/flicker-calibration" },
              { id: "p-agent", author: "agent", body: "See https://support.example.com/display/flicker-calibration" },
            ],
          },
        ],
        moderationActions: [
          { id: "mod_1", threadId: "thr-screen", action: "report", reason: "duplicate issue" },
          { id: "mod_2", threadId: "thr-screen", action: "lock", reason: "known display issue" },
          { id: "mod_3", threadId: "thr-screen", action: "pin", reason: "known display issue" },
        ],
      },
      generatedTaskConfig({
        targetThreadId: "thr-screen",
        expectedReplyValue: "https://support.example.com/display/flicker-calibration",
        expectedLockReason: "known display issue",
        requiresReport: true,
        expectedReportReason: "duplicate issue",
        requiresPin: true,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
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

function makeNotesSession(
  overrides?: Partial<NotesEvaluationSession["state"]>,
): NotesEvaluationSession {
  return {
    app: "notes-lite",
    taskSlug: "notes-followup-create",
    metadata: defaultTaskConfigs.notes,
    state: {
      notes: [
        {
          id: "note_1",
          title: "Support follow-up",
          body: "Email Mira after the replacement adapter ships.",
          tag: "support",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      ...overrides,
    },
  };
}

test("evaluateNotes passes when exact generated note exists", () => {
  const result = evaluateNotes(makeNotesSession());
  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateNotes fails when the generated note tag is wrong", () => {
  const result = evaluateNotes(makeNotesSession({
    notes: [
      {
        id: "note_1",
        title: "Support follow-up",
        body: "Email Mira after the replacement adapter ships.",
        tag: "ops",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  }));
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
    metadata: wikiTaskConfig({
      targetArticleSlug: "shipping-policy",
      kind: "duration",
      canonicalValue: "two business days",
      normalization: "trim-casefold",
    }),
    events: [{ type: "page.load", url: "/wiki/article/shipping-policy?session=tok" }],
    wikiAnswerSubmissions: [{ answer: "two business days", submittedAt: "2026-06-01T00:00:00.000Z" }],
  }));
  assert.equal(result.status, "passed");
});

test("generated wiki contracts score every current answer kind", () => {
  const variants = [
    {
      targetArticleSlug: "agentbench-release-history",
      kind: "date" as const,
      canonicalValue: "June 1, 2026",
      normalization: "trim-casefold-punctuation" as const,
      submittedAnswer: "june 1 2026",
    },
    {
      targetArticleSlug: "shipping-policy",
      kind: "duration" as const,
      canonicalValue: "two business days",
      normalization: "trim-casefold" as const,
      submittedAnswer: "TWO BUSINESS DAYS",
    },
    {
      targetArticleSlug: "usb-c-charger-faq",
      kind: "currency" as const,
      canonicalValue: "$24.99",
      normalization: "trim" as const,
      submittedAnswer: " $24.99 ",
    },
  ];

  for (const variant of variants) {
    const result = evaluateWiki(makeWikiSession({
      metadata: wikiTaskConfig(variant),
      events: [{ type: "page.load", url: `/wiki/article/${variant.targetArticleSlug}?session=tok` }],
      wikiAnswerSubmissions: [{ answer: variant.submittedAnswer, submittedAt: "2026-06-01T00:00:00.000Z" }],
    }));
    assert.equal(result.status, "passed", variant.kind);
  }
});

test("generated wiki duration rejects surrounding words", () => {
  const result = evaluateWiki(makeWikiSession({
    metadata: wikiTaskConfig({
      targetArticleSlug: "shipping-policy",
      kind: "duration",
      canonicalValue: "two business days",
      normalization: "trim-casefold",
    }),
    events: [{ type: "page.load", url: "/wiki/article/shipping-policy?session=tok" }],
    wikiAnswerSubmissions: [{ answer: "within two business days", submittedAt: "2026-06-01T00:00:00.000Z" }],
  }));
  assert.equal(result.status, "failed");
  assert.match(result.evaluators[0]?.errorMessage ?? "", /expected duration/);
});

test("generated wiki contract rejects empty answers", () => {
  const result = evaluateWiki(makeWikiSession({
    wikiAnswerSubmissions: [{ answer: "   ", submittedAt: "2026-06-01T00:00:00.000Z" }],
  }));
  assert.equal(result.status, "failed");
  assert.equal(result.evaluators[0]?.status, "failed");
});

test("legacy wiki metadata remains scoreable", () => {
  const result = evaluateWiki(makeWikiSession({
    metadata: generatedTaskConfig(
      { targetArticleSlug: "agentbench-release-history", expectedAnswer: "June 1, 2026" },
      2,
    ),
    events: [{ type: "page.load", url: "/wiki/article/agentbench-release-history?session=tok" }],
    wikiAnswerSubmissions: [{ answer: "june 1 2026", submittedAt: "2026-06-01T00:00:00.000Z" }],
  }));
  assert.equal(result.status, "passed");
});

test("generated wiki config rejects missing or inconsistent source evidence", () => {
  assert.throws(
    () => evaluateWiki(makeWikiSession({
      metadata: wikiTaskConfig({
        targetArticleSlug: "missing-article",
        kind: "duration",
        canonicalValue: "two business days",
        normalization: "trim-casefold",
      }),
    })),
    /source article does not exist/,
  );
  assert.throws(
    () => evaluateWiki(makeWikiSession({
      metadata: wikiTaskConfig({
        targetArticleSlug: "shipping-policy",
        kind: "duration",
        canonicalValue: "three business days",
        normalization: "trim-casefold",
      }),
    })),
    /does not contain canonical answer/,
  );
  assert.throws(
    () => evaluateWiki(makeWikiSession({
      metadata: generatedTaskConfig({
        targetArticleSlug: "shipping-policy",
        answerContract: {
          kind: "duration",
          canonicalValue: "two business days",
          normalization: "trim-casefold",
          sourceArticleSlug: "agentbench-release-history",
        },
      }),
    })),
    /sourceArticleSlug must match targetArticleSlug/,
  );
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
