import assert from "node:assert/strict";
import test from "node:test";
import { addReplyToThread, lockThread } from "../../src/apps/forum-lite/actions.js";
import { createMergeRequest, updateFileContent } from "../../src/apps/repo-lite/actions.js";
import { addProductToCart, getCartTotal, submitCheckoutOrder } from "../../src/apps/shopping-lite/actions.js";
import { markArticleViewed, submitWikiAnswer } from "../../src/apps/wiki-lite/actions.js";
import { buildInitialSessionState, defaultGoalForSession, defaultStartPathForApp } from "../../src/runtime/app-registry.js";
import type { HostedAppId, HostedSessionFor } from "../../src/runtime/types.js";

function makeSession<TApp extends HostedAppId>(app: TApp): HostedSessionFor<TApp> {
  return {
    id: "session-1",
    token: "tok_1",
    runId: null,
    caseId: null,
    attemptId: null,
    callbackSecret: null,
    app,
    suiteSlug: "hosted-web-suite-v1",
    suiteVersion: "v1",
    taskSlug: `${app}-task`,
    taskVersion: "v1",
    sequenceIndex: 0,
    weight: 1,
    required: true,
    title: null,
    goal: defaultGoalForSession(app, `${app}-task`),
    startPath: defaultStartPathForApp(app),
    seedVersion: `${app}-v1`,
    metadata: {},
    status: "active",
    expiresAt: null,
    accessCount: 0,
    lastAccessedAt: null,
    firstSeenIp: null,
    lastSeenIp: null,
    firstSeenUserAgent: null,
    lastSeenUserAgent: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    events: [],
    persisted: false,
    state: buildInitialSessionState(app),
  } as unknown as HostedSessionFor<TApp>;
}

test("shopping actions add products, submit order, and clear cart", () => {
  const session = makeSession("shopping-lite");
  addProductToCart(session, "prod-charger-30w");
  addProductToCart(session, "prod-charger-30w");

  assert.deepEqual(session.state.cart, [{ productId: "prod-charger-30w", quantity: 2 }]);
  assert.equal(getCartTotal(session), 49.98);

  const order = submitCheckoutOrder(session, {
    makeId: (prefix) => `${prefix}_1`,
    now: () => "2026-06-01T00:00:00.000Z",
    shippingMethod: "standard",
  });

  assert.equal(order.id, "ord_1");
  assert.equal(order.items.length, 1);
  assert.equal(session.state.orders.length, 1);
  assert.deepEqual(session.state.cart, []);
});

test("wiki actions dedupe viewed articles and trim submitted answers", () => {
  const session = makeSession("wiki-lite");

  assert.equal(markArticleViewed(session, "agentbench-release-history"), true);
  assert.equal(markArticleViewed(session, "agentbench-release-history"), false);
  assert.deepEqual(session.metadata.viewedArticleSlugs, ["agentbench-release-history"]);

  const answer = submitWikiAnswer(session, {
    answer: "  June 1, 2026  ",
    now: () => "2026-06-01T00:00:00.000Z",
  });

  assert.equal(answer, "June 1, 2026");
  assert.equal(session.state.wikiAnswerSubmissions.at(-1)?.answer, "June 1, 2026");
});

test("forum actions reject locked threads and persist moderation actions", () => {
  const session = makeSession("forum-lite");

  const reply = addReplyToThread(session, {
    threadId: "thr-battery",
    author: "agent",
    body: "Recall: https://support.example.com/recall/battery-2026",
    makeId: (prefix) => `${prefix}_1`,
  });
  assert.equal(reply.success, true);

  const lock = lockThread(session, {
    threadId: "thr-battery",
    reason: "safety escalation",
    makeId: (prefix) => `${prefix}_1`,
  });
  assert.equal(lock.success, true);
  assert.equal(session.state.threads.find((thread) => thread.id === "thr-battery")?.locked, true);
  assert.equal(session.state.moderationActions.at(-1)?.reason, "safety escalation");

  const rejected = addReplyToThread(session, {
    threadId: "thr-battery",
    author: "agent",
    body: "late reply",
    makeId: (prefix) => `${prefix}_2`,
  });
  assert.deepEqual(rejected, { success: false, error: "Thread is locked" });
});

test("repo actions update README and create merge request snapshots", () => {
  const session = makeSession("repo-lite");
  const update = updateFileContent(session, "README.md", "# Demo Project\n\nRun `pnpm install`.\n");
  assert.equal(update.success, true);

  const mr = createMergeRequest(session, {
    title: "Fix install instructions",
    targetBranch: "main",
    makeId: (prefix) => `${prefix}_1`,
  });

  assert.equal(mr.success, true);
  assert.equal(session.state.mergeRequests.length, 1);
  assert.equal(session.state.mergeRequests[0].title, "Fix install instructions");
  assert.equal(session.state.mergeRequests[0].changedFiles[0].content.includes("pnpm install"), true);
});
