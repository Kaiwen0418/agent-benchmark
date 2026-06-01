import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCheckout, evaluateWiki, type HostedEvaluationSession } from "./evaluation";

function makeShoppingSession(overrides?: Partial<HostedEvaluationSession>): HostedEvaluationSession {
  return {
    app: "shopping-lite",
    taskSlug: "shopping-constrained-checkout",
    metadata: {},
    events: [],
    wikiAnswerSubmissions: [],
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
}

function makeWikiSession(overrides?: Partial<HostedEvaluationSession>): HostedEvaluationSession {
  return {
    app: "wiki-lite",
    taskSlug: "wiki-release-answer",
    products: [],
    orders: [],
    metadata: {},
    events: [],
    wikiAnswerSubmissions: [],
    ...overrides,
  };
}

test("evaluateCheckout passes for one unrestricted charger under budget with standard shipping", () => {
  const result = evaluateCheckout(makeShoppingSession());
  assert.equal(result.status, "passed");
  assert.equal(result.score, 1);
});

test("evaluateCheckout fails when restricted item is included", () => {
  const result = evaluateCheckout(
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
