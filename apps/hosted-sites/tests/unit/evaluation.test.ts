import assert from "node:assert/strict";
import test from "node:test";
import { evaluateForum, type ForumEvaluationSession } from "../../src/apps/forum-lite/evaluate.js";
import { forumSeedThreads } from "../../src/apps/forum-lite/seed.js";
import { forumLiteTestSupport } from "../../src/apps/forum-lite/test-support.js";
import { evaluateNotes, type NotesEvaluationSession } from "../../src/apps/notes-lite/evaluate.js";
import { evaluateRepo, type RepoEvaluationSession } from "../../src/apps/repo-lite/evaluate.js";
import { repoSeedFiles } from "../../src/apps/repo-lite/seed.js";
import { repoLiteTestSupport } from "../../src/apps/repo-lite/test-support.js";
import { computeCiStatuses, readCiChecks } from "../../src/apps/repo-lite/workflow.js";
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
  kind: "date" | "duration" | "currency" | "text";
  canonicalValue: string;
  normalization: "trim" | "trim-casefold" | "trim-casefold-punctuation";
  secondaryArticleSlug?: string;
}) {
  return generatedTaskConfig({
    targetArticleSlug: params.targetArticleSlug,
    secondaryArticleSlug: params.secondaryArticleSlug,
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

const hardShoppingProducts: ShoppingEvaluationSession["state"]["products"] = [
  { id: "prod-charger-20w", name: "VoltEdge 20W USB-C Charger", category: "charger", price: 18.99, stock: 10 },
  { id: "prod-charger-30w", name: "VoltEdge 30W USB-C Charger", category: "charger", price: 24.99 },
  { id: "prod-cable-1m", name: "Braided USB-C Cable 1m", category: "cable", price: 9.99, stock: 20 },
  { id: "prod-case", name: "Compact Charger Travel Case", category: "case", price: 12.5 },
  {
    id: "prod-charger-probook-100w",
    name: "ProBook 100W GaN Charger",
    category: "charger",
    price: 32.99,
    stock: 0,
    compatibleWith: ["ProBook"],
  },
  {
    id: "prod-charger-probook-30w",
    name: "ProBook 30W Travel Charger",
    category: "charger",
    price: 27.99,
    stock: 6,
    compatibleWith: ["ProBook"],
  },
  {
    id: "prod-charger-airlite-45w",
    name: "AirLite 45W Charger",
    category: "charger",
    price: 29.99,
    stock: 4,
    compatibleWith: ["AirLite"],
  },
];

const compatibleChargerConfig = generatedTaskConfig({
  targetCategory: "charger",
  quantity: 1,
  maxTotal: 35,
  shippingMethod: "standard",
  avoidRestricted: true,
  requiredDevice: "ProBook",
});

test("evaluateShopping passes when a compatible in-stock charger is ordered for the required device", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_probook",
            items: [{ productId: "prod-charger-probook-30w", quantity: 1 }],
            subtotal: 27.99,
            total: 27.99,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      compatibleChargerConfig,
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateShopping fails when the ordered charger is not compatible with the required device", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_incompatible",
            items: [{ productId: "prod-charger-30w", quantity: 1 }],
            subtotal: 24.99,
            total: 24.99,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      compatibleChargerConfig,
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateShopping fails when an order exceeds available stock", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_overstock",
            items: [{ productId: "prod-charger-probook-30w", quantity: 9 }],
            subtotal: 251.91,
            total: 30,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 9,
        maxTotal: 300,
        shippingMethod: "standard",
        avoidRestricted: true,
        requiredDevice: "ProBook",
      }),
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

const couponBundleConfig = generatedTaskConfig({
  targetCategory: "cable",
  quantity: 3,
  maxTotal: 28,
  shippingMethod: "standard",
  avoidRestricted: true,
  couponCode: "CABLE20",
  discountPercent: 20,
});

test("evaluateShopping passes when the required coupon brings the bundle under budget", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_coupon",
            items: [{ productId: "prod-cable-1m", quantity: 3 }],
            subtotal: 29.97,
            total: 23.98,
            couponCode: "CABLE20",
            discountAmount: 5.99,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      couponBundleConfig,
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateShopping fails when the coupon is missing and the bundle exceeds budget", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_nocoupon",
            items: [{ productId: "prod-cable-1m", quantity: 3 }],
            subtotal: 29.97,
            total: 29.97,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      couponBundleConfig,
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateShopping passes for a five-unit team charger order within budget", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_team",
            items: [{ productId: "prod-charger-20w", quantity: 5 }],
            subtotal: 94.95,
            total: 94.95,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        targetCategory: "charger",
        quantity: 5,
        maxTotal: 120,
        shippingMethod: "standard",
        avoidRestricted: true,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

const proBookTeamKitConfig = generatedTaskConfig({
  targetCategory: "charger",
  quantity: 2,
  maxTotal: 61,
  shippingMethod: "standard",
  avoidRestricted: true,
  requiredDevice: "ProBook",
  secondaryCategory: "cable",
  secondaryQuantity: 2,
  couponCode: "CABLE20",
  discountPercent: 20,
  freeShippingThreshold: 70,
  shippingCost: 8,
});

test("evaluateShopping passes a combined compatibility, stock, coupon, and shipping-threshold order", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_team_kit",
            items: [
              { productId: "prod-charger-probook-30w", quantity: 2 },
              { productId: "prod-cable-1m", quantity: 2 },
            ],
            subtotal: 75.96,
            total: 60.77,
            couponCode: "CABLE20",
            discountAmount: 15.19,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      proBookTeamKitConfig,
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
  assert.equal(result.evaluators[0]?.evidence?.amountIntegrity, true);
});

test("evaluateShopping fails a forged discounted total despite the correct coupon code", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_forged_team_kit",
            items: [
              { productId: "prod-charger-probook-30w", quantity: 2 },
              { productId: "prod-cable-1m", quantity: 2 },
            ],
            subtotal: 75.96,
            total: 55,
            couponCode: "CABLE20",
            discountAmount: 20.96,
            shippingMethod: "standard",
            shippingCost: 0,
            submittedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      proBookTeamKitConfig,
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
  assert.equal(result.evaluators[0]?.evidence?.amountIntegrity, false);
});

test("evaluateShopping charges configured shipping below the pre-discount threshold", () => {
  const result = evaluateShopping(
    makeShoppingSession(
      {
        products: hardShoppingProducts,
        orders: [
          {
            id: "ord_below_threshold",
            items: [
              { productId: "prod-charger-probook-30w", quantity: 1 },
              { productId: "prod-cable-1m", quantity: 1 },
            ],
            subtotal: 37.98,
            total: 38.38,
            couponCode: "CABLE20",
            discountAmount: 7.6,
            shippingMethod: "standard",
            shippingCost: 8,
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
        requiredDevice: "ProBook",
        secondaryCategory: "cable",
        secondaryQuantity: 1,
        couponCode: "CABLE20",
        discountPercent: 20,
        freeShippingThreshold: 70,
        shippingCost: 8,
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.evaluators[0]?.evidence?.expectedShipping, 8);
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

test("evaluateWiki passes when both target and secondary articles are viewed for multi-hop variant", () => {
  const result = evaluateWiki(
    makeWikiSession({
      metadata: wikiTaskConfig({
        targetArticleSlug: "usb-c-charger-faq",
        kind: "currency",
        canonicalValue: "$24.99",
        normalization: "trim",
        secondaryArticleSlug: "agentbench-release-history",
      }),
      events: [
        { type: "page.load", url: "/wiki/article/agentbench-release-history?session=tok" },
        { type: "page.load", url: "/wiki/article/usb-c-charger-faq?session=tok" },
      ],
      wikiAnswerSubmissions: [{ answer: "$24.99", submittedAt: "2026-06-01T00:00:00.000Z" }],
    }),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateWiki fails when secondary article is required but not viewed", () => {
  const result = evaluateWiki(
    makeWikiSession({
      metadata: wikiTaskConfig({
        targetArticleSlug: "usb-c-charger-faq",
        kind: "currency",
        canonicalValue: "$24.99",
        normalization: "trim",
        secondaryArticleSlug: "agentbench-release-history",
      }),
      events: [{ type: "page.load", url: "/wiki/article/usb-c-charger-faq?session=tok" }],
      wikiAnswerSubmissions: [{ answer: "$24.99", submittedAt: "2026-06-01T00:00:00.000Z" }],
    }),
  );

  assert.equal(result.status, "failed");
  assert.match(result.summary, /secondary article/i);
});

// Hard multi-hop variants (#111): each follows a release note / index / compare
// page to the article marked current, while a deprecated/legacy page offers a
// stale value that must be rejected.
const wikiHardVariants = [
  {
    id: "current-return-window",
    target: "returns-policy",
    secondary: "changelog-2026-q2",
    kind: "duration" as const,
    canonical: "30 days",
    normalization: "trim-casefold" as const,
    stale: "14 days",
    staleArticle: "returns-policy-2025",
  },
  {
    id: "current-warranty-coverage",
    target: "warranty-policy",
    secondary: "warranty-policy-legacy",
    kind: "duration" as const,
    canonical: "24 months",
    normalization: "trim-casefold" as const,
    stale: "12 months",
    staleArticle: "warranty-policy-legacy",
  },
  {
    id: "recommended-probook-charger",
    target: "laptop-charger-guide",
    secondary: "charger-compatibility-matrix",
    kind: "text" as const,
    canonical: "ProBook 30W Travel Charger",
    normalization: "trim-casefold" as const,
    stale: "AirLite 45W Charger",
    staleArticle: "charger-compatibility-matrix",
  },
  {
    id: "current-api-rate-limit",
    target: "api-reference-v3",
    secondary: "api-changelog",
    kind: "text" as const,
    canonical: "240 requests per minute",
    normalization: "trim-casefold-punctuation" as const,
    stale: "120 requests per minute",
    staleArticle: "api-reference-v2",
  },
  {
    id: "current-data-retention",
    target: "data-retention-policy",
    secondary: "security-overview",
    kind: "duration" as const,
    canonical: "90 days",
    normalization: "trim-casefold" as const,
    stale: "180 days",
    staleArticle: "data-retention-2024",
  },
];

test("wiki hard corpus is large enough that broad scanning is unreliable", () => {
  assert.ok(
    wikiSeedArticles.length >= 30,
    `expected >= 30 wiki articles, found ${wikiSeedArticles.length}`,
  );
  const slugs = new Set(wikiSeedArticles.map((article) => article.slug));
  assert.equal(slugs.size, wikiSeedArticles.length, "wiki article slugs must be unique");
});

for (const variant of wikiHardVariants) {
  const bySlug = new Map(wikiSeedArticles.map((article) => [article.slug, article]));

  test(`wiki hard variant ${variant.id}: canonical value is sourced from the current target article`, () => {
    const target = bySlug.get(variant.target);
    const secondary = bySlug.get(variant.secondary);
    assert.ok(target, `target article ${variant.target} must exist in the corpus`);
    assert.ok(secondary, `secondary article ${variant.secondary} must exist in the corpus`);
    assert.ok(
      target!.body.includes(variant.canonical),
      `target ${variant.target} body must contain canonical "${variant.canonical}"`,
    );
    // The stale value lives in a distractor and must differ from the answer.
    assert.notEqual(variant.stale, variant.canonical);
    const staleArticle = bySlug.get(variant.staleArticle);
    assert.ok(staleArticle, `stale distractor ${variant.staleArticle} must exist`);
    assert.ok(
      staleArticle!.body.includes(variant.stale),
      `distractor ${variant.staleArticle} must contain stale value "${variant.stale}"`,
    );
  });

  test(`wiki hard variant ${variant.id}: passes when the multi-hop path and current answer are used`, () => {
    const result = evaluateWiki(
      makeWikiSession({
        metadata: wikiTaskConfig({
          targetArticleSlug: variant.target,
          kind: variant.kind,
          canonicalValue: variant.canonical,
          normalization: variant.normalization,
          secondaryArticleSlug: variant.secondary,
        }),
        events: [
          { type: "page.load", url: `/wiki/article/${variant.secondary}?session=tok` },
          { type: "page.load", url: `/wiki/article/${variant.target}?session=tok` },
        ],
        wikiAnswerSubmissions: [{ answer: variant.canonical, submittedAt: "2026-06-01T00:00:00.000Z" }],
      }),
    );

    assert.equal(result.status, "passed", result.summary);
    assert.equal(result.score, 1);
  });

  test(`wiki hard variant ${variant.id}: fails when the stale/deprecated value is submitted`, () => {
    const result = evaluateWiki(
      makeWikiSession({
        metadata: wikiTaskConfig({
          targetArticleSlug: variant.target,
          kind: variant.kind,
          canonicalValue: variant.canonical,
          normalization: variant.normalization,
          secondaryArticleSlug: variant.secondary,
        }),
        events: [
          { type: "page.load", url: `/wiki/article/${variant.secondary}?session=tok` },
          { type: "page.load", url: `/wiki/article/${variant.target}?session=tok` },
        ],
        wikiAnswerSubmissions: [{ answer: variant.stale, submittedAt: "2026-06-01T00:00:00.000Z" }],
      }),
    );

    assert.equal(result.status, "failed");
  });

  test(`wiki hard variant ${variant.id}: fails when the secondary hop is skipped`, () => {
    const result = evaluateWiki(
      makeWikiSession({
        metadata: wikiTaskConfig({
          targetArticleSlug: variant.target,
          kind: variant.kind,
          canonicalValue: variant.canonical,
          normalization: variant.normalization,
          secondaryArticleSlug: variant.secondary,
        }),
        events: [{ type: "page.load", url: `/wiki/article/${variant.target}?session=tok` }],
        wikiAnswerSubmissions: [{ answer: variant.canonical, submittedAt: "2026-06-01T00:00:00.000Z" }],
      }),
    );

    assert.equal(result.status, "failed");
    assert.match(result.summary, /secondary article/i);
  });
}

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

// Hard forum triage variants (#112). Build a session from the real seed so the
// duplicate / miscategorized / vague-title threads exist, drive it to a passing
// state via the shared test-support helper, then confirm both the positive path
// and that removing the hard-specific action fails the evaluation.
const forumHardVariants = [
  {
    id: "charge-duplicate-triage",
    config: {
      targetThreadId: "thr-charge-main",
      expectedReplyValue: "https://support.example.com/hardware/usb-c-charging-fix",
      expectedLockReason: "resolved with guide",
      requiresMarkDuplicate: true,
      canonicalThreadId: "thr-charge-main",
      duplicateThreadIds: ["thr-charge-dup1", "thr-charge-dup2"],
    },
    breakAction: "mark_duplicate" as const,
  },
  {
    id: "misfiled-safety-escalation",
    config: {
      targetThreadId: "thr-misfiled-safety",
      expectedReplyValue: "https://support.example.com/safety/adapter-smoke",
      expectedLockReason: "safety escalation",
      requiresMove: true,
      expectedCategory: "safety",
    },
    breakAction: "move" as const,
  },
  {
    id: "vague-title-cleanup",
    config: {
      targetThreadId: "thr-vague-title",
      expectedReplyValue: "https://support.example.com/network/dns-reset",
      expectedLockReason: "resolved with guide",
      requiresEditTitle: true,
      expectedTitle: "DNS resolution failures on wired connection",
    },
    breakAction: "edit_title" as const,
  },
  {
    id: "hot-charge-consolidate",
    config: {
      targetThreadId: "thr-hot-main",
      expectedReplyValue: "https://support.example.com/safety/fast-charge-heat",
      expectedLockReason: "safety escalation",
      requiresMove: true,
      expectedCategory: "safety",
      requiresMarkDuplicate: true,
      canonicalThreadId: "thr-hot-main",
      duplicateThreadIds: ["thr-hot-dup"],
    },
    breakAction: "move" as const,
  },
];

function makeForumHardSession(metadata: Record<string, unknown>): ForumEvaluationSession {
  return {
    app: "forum-lite",
    taskSlug: "forum-triage-hard",
    metadata,
    state: {
      threads: forumSeedThreads.map((thread) => ({
        ...thread,
        posts: thread.posts.map((post) => ({ ...post })),
      })),
      moderationActions: [],
    },
  };
}

for (const variant of forumHardVariants) {
  test(`forum hard variant ${variant.id}: passes when the full triage sequence is applied`, () => {
    const session = makeForumHardSession(generatedTaskConfig(variant.config));
    forumLiteTestSupport.applyPassingState(
      session as unknown as Parameters<typeof forumLiteTestSupport.applyPassingState>[0],
      variant.config,
    );
    const result = evaluateForum(session);
    assert.equal(result.status, "passed", result.summary);
    assert.equal(result.score, 1);
  });

  test(`forum hard variant ${variant.id}: fails when the ${variant.breakAction} action is missing`, () => {
    const session = makeForumHardSession(generatedTaskConfig(variant.config));
    forumLiteTestSupport.applyPassingState(
      session as unknown as Parameters<typeof forumLiteTestSupport.applyPassingState>[0],
      variant.config,
    );
    // Drop the hard-specific moderation action while leaving lock/reply intact.
    session.state.moderationActions = session.state.moderationActions.filter(
      (action) => action.action !== variant.breakAction,
    );
    if (variant.breakAction === "move") {
      const target = session.state.threads.find((thread) => thread.id === variant.config.targetThreadId);
      if (target) target.category = "general";
    }
    if (variant.breakAction === "edit_title") {
      const target = session.state.threads.find((thread) => thread.id === variant.config.targetThreadId);
      if (target) target.title = "Help??? urgent!!!";
    }
    const result = evaluateForum(session);
    assert.equal(result.status, "failed");
  });
}

test("forum ordered hard workflow fails when moderation actions are applied out of order", () => {
  const config = {
    targetThreadId: "thr-hot-main",
    expectedReplyValue: "https://support.example.com/safety/fast-charge-heat",
    expectedLockReason: "safety escalation",
    requiresReport: true,
    expectedReportReason: "thermal incident",
    requiresMove: true,
    expectedCategory: "safety",
    requiresEditTitle: true,
    expectedTitle: "Fast-charge overheating safety incident",
    requiresMarkDuplicate: true,
    canonicalThreadId: "thr-hot-main",
    duplicateThreadIds: ["thr-hot-dup"],
    requiresPin: true,
    requiredActionOrder: ["report", "move", "edit_title", "mark_duplicate", "lock", "pin"],
  };
  const session = makeForumHardSession(generatedTaskConfig(config));
  forumLiteTestSupport.applyPassingState(
    session as unknown as Parameters<typeof forumLiteTestSupport.applyPassingState>[0],
    config,
  );
  const moveIndex = session.state.moderationActions.findIndex((action) => action.action === "move");
  const reportIndex = session.state.moderationActions.findIndex((action) => action.action === "report");
  [session.state.moderationActions[moveIndex], session.state.moderationActions[reportIndex]] = [
    session.state.moderationActions[reportIndex]!,
    session.state.moderationActions[moveIndex]!,
  ];

  const result = evaluateForum(session);
  assert.equal(result.status, "failed");
  assert.equal(result.evaluators[1]?.evidence?.actionOrderMatches, false);
});

function makeRepoSession(
  overrides?: Partial<RepoEvaluationSession["state"]>,
  metadata?: Record<string, unknown>,
): RepoEvaluationSession {
  return {
    app: "repo-lite",
    taskSlug: "repo-readme-fix",
    metadata: metadata ?? defaultTaskConfigs.repo,
    state: {
      files: [
        {
          path: "README.md",
          content: "# Demo Project\n\nRun `npm install` to install dependencies.\n",
        },
        {
          path: "package.json",
          content: '{\n  "name": "demo-project",\n  "version": "1.0.0"\n}\n',
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

test("evaluateRepo passes when README and package.json are edited correctly", () => {
  const result = evaluateRepo(
    makeRepoSession(
      {
        files: [
          {
            path: "README.md",
            content: "# Demo Project\n\nRun `pnpm install` to install dependencies.\n",
          },
          {
            path: "package.json",
            content: '{\n  "name": "demo-project",\n  "version": "1.0.1"\n}\n',
          },
        ],
        mergeRequests: [
          {
            id: "mr_1",
            title: "Fix install and bump version",
            changedFiles: [],
            targetBranch: "main",
          },
        ],
      },
      generatedTaskConfig({
        filePath: "README.md",
        expectedText: "pnpm install",
        forbiddenText: "npm install",
        expectedMrTitle: "Fix install and bump version",
        expectedTargetBranch: "main",
        secondaryFilePath: "package.json",
        secondaryExpectedText: "1.0.1",
        secondaryForbiddenText: "1.0.0",
      }),
    ),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateRepo fails when secondary file edit is missing", () => {
  const result = evaluateRepo(
    makeRepoSession(
      {
        files: [
          {
            path: "README.md",
            content: "# Demo Project\n\nRun `pnpm install` to install dependencies.\n",
          },
          {
            path: "package.json",
            content: '{\n  "name": "demo-project",\n  "version": "1.0.0"\n}\n',
          },
        ],
        mergeRequests: [
          {
            id: "mr_1",
            title: "Fix install and bump version",
            changedFiles: [],
            targetBranch: "main",
          },
        ],
      },
      generatedTaskConfig({
        filePath: "README.md",
        expectedText: "pnpm install",
        forbiddenText: "npm install",
        expectedMrTitle: "Fix install and bump version",
        expectedTargetBranch: "main",
        secondaryFilePath: "package.json",
        secondaryExpectedText: "1.0.1",
        secondaryForbiddenText: "1.0.0",
      }),
    ),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

// Hard repo workflow variants (#114): a coherent change must span the primary,
// secondary, and additional files, and the simulated CI consistency check must
// be green, before the terminal merge request scores a pass.
type HardRepoVariant = {
  id: string;
  config: Record<string, unknown>;
  // The additional-edit file reverted to seed content to break exactly one gate.
  breakFile: { path: string; content: string };
};

const hardRepoVariants: HardRepoVariant[] = [
  {
    id: "release-2-0-0",
    config: {
      filePath: "package.json",
      expectedText: '"version": "2.0.0"',
      forbiddenText: '"version": "1.0.0"',
      expectedMrTitle: "Release 2.0.0",
      expectedTargetBranch: "release",
      secondaryFilePath: "src/version.ts",
      secondaryExpectedText: 'VERSION = "2.0.0"',
      secondaryForbiddenText: 'VERSION = "1.0.0"',
      additionalFileEdits: [{ filePath: "CHANGELOG.md", expectedText: "## 2.0.0" }],
      ciChecks: [
        { name: "Version consistency", token: "2.0.0", files: ["package.json", "src/version.ts", "CHANGELOG.md"] },
      ],
    },
    breakFile: { path: "CHANGELOG.md", content: "# Changelog\n\n## 1.0.0\n\n- Initial release.\n" },
  },
  {
    id: "rename-to-acme-cli",
    config: {
      filePath: "package.json",
      expectedText: '"name": "acme-cli"',
      forbiddenText: '"name": "demo-project"',
      expectedMrTitle: "Rename project to acme-cli",
      expectedTargetBranch: "main",
      secondaryFilePath: "src/config.ts",
      secondaryExpectedText: 'APP_NAME = "acme-cli"',
      secondaryForbiddenText: 'APP_NAME = "demo-project"',
      additionalFileEdits: [{ filePath: "README.md", expectedText: "acme-cli" }],
      ciChecks: [
        { name: "Project name consistency", token: "acme-cli", files: ["package.json", "src/config.ts", "README.md"] },
      ],
    },
    breakFile: {
      path: "README.md",
      content: "# Demo Project\n\n## Install\n\nRun `npm install` to install dependencies.\n",
    },
  },
  {
    id: "api-v2-rollout",
    config: {
      filePath: "src/api.ts",
      expectedText: 'API_VERSION = "v2"',
      forbiddenText: 'API_VERSION = "v1"',
      expectedMrTitle: "Roll out API v2",
      expectedTargetBranch: "develop",
      secondaryFilePath: "docs/API.md",
      secondaryExpectedText: "Stable version: v2",
      secondaryForbiddenText: "Stable version: v1",
      additionalFileEdits: [{ filePath: "README.md", expectedText: "API v2" }],
      ciChecks: [
        { name: "API version consistency", token: "v2", files: ["src/api.ts", "docs/API.md", "README.md"] },
      ],
    },
    breakFile: {
      path: "README.md",
      content: "# Demo Project\n\n## Install\n\nRun `npm install` to install dependencies.\n",
    },
  },
];

function makeHardRepoSession(metadata: Record<string, unknown>): RepoEvaluationSession {
  return {
    app: "repo-lite",
    taskSlug: "repo-coherent-edit-hard",
    metadata,
    state: {
      files: repoSeedFiles.map((file) => ({ ...file })),
      mergeRequests: [],
    },
  };
}

for (const variant of hardRepoVariants) {
  test(`repo hard variant ${variant.id}: passes when every coherent edit and CI check is satisfied`, () => {
    const session = makeHardRepoSession(generatedTaskConfig(variant.config));
    repoLiteTestSupport.applyPassingState(
      session as unknown as Parameters<typeof repoLiteTestSupport.applyPassingState>[0],
      variant.config,
    );
    const result = evaluateRepo(session);
    assert.equal(result.status, "passed", result.summary);
    assert.equal(result.score, 1);
    // The simulated CI gate the agent observes must be green for the passing state.
    const ciStatuses = computeCiStatuses(session.state.files, readCiChecks(variant.config));
    assert.ok(ciStatuses.length > 0);
    assert.ok(ciStatuses.every((status) => status.passed));
  });

  test(`repo hard variant ${variant.id}: fails when the additional ${variant.breakFile.path} edit is missing`, () => {
    const session = makeHardRepoSession(generatedTaskConfig(variant.config));
    repoLiteTestSupport.applyPassingState(
      session as unknown as Parameters<typeof repoLiteTestSupport.applyPassingState>[0],
      variant.config,
    );
    // Revert the additional file: the primary, secondary, and MR remain correct,
    // so only the additionalFileEdit + CI gate can explain the failure.
    const target = session.state.files.find((file) => file.path === variant.breakFile.path);
    if (target) target.content = variant.breakFile.content;
    const result = evaluateRepo(session);
    assert.equal(result.status, "failed");
    assert.equal(result.score, 0);
    const ciStatuses = computeCiStatuses(session.state.files, readCiChecks(variant.config));
    assert.ok(ciStatuses.some((status) => !status.passed));
  });
}

function makeNotesSession(
  overrides?: Partial<NotesEvaluationSession["state"]>,
  metadata?: Record<string, unknown>,
): NotesEvaluationSession {
  return {
    app: "notes-lite",
    taskSlug: "notes-followup-create",
    metadata: metadata ?? defaultTaskConfigs.notes,
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

test("evaluateNotes passes when targeted seeded note is updated", () => {
  const result = evaluateNotes(
    makeNotesSession(
      {
        notes: [
          {
            id: "note-seed-support",
            title: "Support follow-up",
            body: "Email Mira after the replacement adapter ships.",
            tag: "support",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        expectedTitle: "Support follow-up",
        expectedBody: "Email Mira after the replacement adapter ships.",
        expectedTag: "support",
        targetNoteId: "note-seed-support",
      }),
    ),
  );
  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateNotes fails when targeted seeded note is not updated", () => {
  const result = evaluateNotes(
    makeNotesSession(
      {
        notes: [
          {
            id: "note-seed-support",
            title: "Old support follow-up",
            body: "Follow up with Mira about the replacement adapter.",
            tag: "support",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({
        expectedTitle: "Support follow-up",
        expectedBody: "Email Mira after the replacement adapter ships.",
        expectedTag: "support",
        targetNoteId: "note-seed-support",
      }),
    ),
  );
  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateNotes carry variant passes with any non-empty title when title is unpinned", () => {
  const carryConfig = generatedTaskConfig({
    expectedBody: "File the release-lookup result for the upgrade plan.",
    expectedTag: "release",
  });
  const result = evaluateNotes(
    makeNotesSession(
      {
        notes: [
          {
            id: "note_carry",
            title: "90 days",
            body: "File the release-lookup result for the upgrade plan.",
            tag: "release",
            createdAt: "2026-06-23T00:00:00.000Z",
          },
        ],
      },
      carryConfig,
    ),
  );
  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateNotes carry variant fails when the title is empty", () => {
  const carryConfig = generatedTaskConfig({
    expectedBody: "File the release-lookup result for the upgrade plan.",
    expectedTag: "release",
  });
  const result = evaluateNotes(
    makeNotesSession(
      {
        notes: [
          {
            id: "note_carry",
            title: "   ",
            body: "File the release-lookup result for the upgrade plan.",
            tag: "release",
            createdAt: "2026-06-23T00:00:00.000Z",
          },
        ],
      },
      carryConfig,
    ),
  );
  assert.equal(result.status, "failed");
  assert.equal(result.score, 0);
});

test("evaluateNotes dual-carry variant passes with non-empty unpinned title and body", () => {
  const result = evaluateNotes(
    makeNotesSession(
      {
        notes: [
          {
            id: "note_dual_carry",
            title: "30 days",
            body: "90 days",
            tag: "release",
            createdAt: "2026-06-23T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({ expectedTag: "release" }),
    ),
  );
  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
  assert.equal(result.evaluators[0]?.evidence?.titlePinned, false);
  assert.equal(result.evaluators[0]?.evidence?.bodyPinned, false);
});

test("evaluateNotes dual-carry variant fails when the carried body is empty", () => {
  const result = evaluateNotes(
    makeNotesSession(
      {
        notes: [
          {
            id: "note_dual_carry",
            title: "30 days",
            body: "   ",
            tag: "release",
            createdAt: "2026-06-23T00:00:00.000Z",
          },
        ],
      },
      generatedTaskConfig({ expectedTag: "release" }),
    ),
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
