import assert from "node:assert/strict";
import test from "node:test";
import { hostedWebSuiteMetadata } from "@agentbench/test-cases";
import { buildInitialSessionState, evaluateSession } from "../../src/runtime/app-registry.js";
import type { HostedAppId, HostedSession } from "../../src/runtime/types.js";

type DeclaredVariant = {
  id: string;
  goal: string;
  taskConfig: Record<string, unknown>;
};

type DeclaredSession = {
  app: HostedAppId;
  taskSlug: string;
  sequenceIndex: number;
  metadata: { questionVariants: DeclaredVariant[] };
};

const uiVariants = ["workspace", "sidebar", "compact", "dashboard", "editorial"] as const;
const uiThemes = ["light", "dark"] as const;

function readDeclaredSessions() {
  return hostedWebSuiteMetadata.sessions as DeclaredSession[];
}

function configString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  assert.equal(typeof value, "string", key);
  return value as string;
}

function makeSession(definition: DeclaredSession, variant: DeclaredVariant): HostedSession {
  const state = buildInitialSessionState(definition.app);
  return {
    id: `session-${definition.app}-${variant.id}`,
    token: "matrix-token",
    accessMode: "write",
    runId: "matrix-run",
    caseId: "matrix-case",
    attemptId: "matrix-attempt",
    callbackSecret: null,
    app: definition.app,
    suiteSlug: "hosted-web-suite-v1",
    suiteVersion: "v2",
    taskSlug: definition.taskSlug,
    taskVersion: "matrix",
    sequenceIndex: definition.sequenceIndex,
    weight: 1,
    required: true,
    title: null,
    goal: variant.goal,
    startPath: null,
    seedVersion: `${definition.app}:${variant.id}`,
    metadata: {
      questionGeneration: {
        schemaVersion: 3,
        generationSeed: "matrix",
        variantId: variant.id,
        uiVariant: "workspace",
        uiTheme: "light",
        taskConfig: variant.taskConfig,
      },
    },
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
    state,
    persisted: true,
  } as HostedSession;
}

function applyPassingState(session: HostedSession, config: Record<string, unknown>) {
  if (session.app === "shopping-lite") {
    const category = configString(config, "targetCategory");
    const maxTotal = Number(config.maxTotal);
    const product = session.state.products.find(
      (candidate) => candidate.category === category && !candidate.restricted && candidate.price <= maxTotal,
    );
    assert.ok(product, `missing valid ${category} fixture`);
    const quantity = Number(config.quantity);
    session.state.orders.push({
      id: "order-matrix",
      items: [{ productId: product.id, quantity }],
      total: product.price * quantity,
      shippingMethod: configString(config, "shippingMethod") as "standard" | "express",
      submittedAt: "2026-06-01T00:00:00.000Z",
    });
    return;
  }
  if (session.app === "forum-lite") {
    const threadId = configString(config, "targetThreadId");
    const thread = session.state.threads.find((candidate) => candidate.id === threadId);
    assert.ok(thread, `missing thread ${threadId}`);
    thread.posts.push({ id: "post-matrix", author: "agent", body: configString(config, "expectedReplyValue") });
    thread.locked = true;
    session.state.moderationActions.push({
      id: "moderation-matrix",
      threadId,
      action: "lock",
      reason: configString(config, "expectedLockReason"),
    });
    return;
  }
  if (session.app === "repo-lite") {
    const filePath = configString(config, "filePath");
    const file = session.state.files.find((candidate) => candidate.path === filePath);
    assert.ok(file, `missing file ${filePath}`);
    file.content = file.content.replaceAll(configString(config, "forbiddenText"), configString(config, "expectedText"));
    session.state.mergeRequests.push({
      id: "mr-matrix",
      title: configString(config, "expectedMrTitle"),
      targetBranch: configString(config, "expectedTargetBranch"),
      changedFiles: [{ path: file.path, content: file.content }],
    });
    return;
  }

  const contract = config.answerContract as Record<string, unknown>;
  const slug = configString(config, "targetArticleSlug");
  session.events.push({ type: "page.load", url: `/wiki/article/${slug}` });
  session.state.wikiAnswerSubmissions.push({
    answer: configString(contract, "canonicalValue"),
    submittedAt: "2026-06-01T00:00:00.000Z",
  });
}

function breakPassingState(session: HostedSession) {
  if (session.app === "shopping-lite") {
    session.state.orders[0]!.shippingMethod = session.state.orders[0]!.shippingMethod === "standard" ? "express" : "standard";
  } else if (session.app === "forum-lite") {
    session.state.moderationActions[0]!.reason = "wrong reason";
  } else if (session.app === "repo-lite") {
    session.state.mergeRequests[0]!.title = "Wrong title";
  } else {
    session.state.wikiAnswerSubmissions[0]!.answer = "wrong answer";
  }
}

for (const definition of readDeclaredSessions()) {
  for (const variant of definition.metadata.questionVariants) {
    test(`${definition.app}/${variant.id} has positive, negative, and presentation-invariant scoring`, () => {
      const passing = makeSession(definition, variant);
      applyPassingState(passing, variant.taskConfig);
      assert.equal(evaluateSession(passing).status, "passed");

      for (const uiVariant of uiVariants) {
        for (const uiTheme of uiThemes) {
          const generation = passing.metadata.questionGeneration as Record<string, unknown>;
          generation.uiVariant = uiVariant;
          generation.uiTheme = uiTheme;
          assert.equal(evaluateSession(passing).status, "passed", `${uiVariant}/${uiTheme}`);
        }
      }

      const failing = structuredClone(passing);
      breakPassingState(failing);
      assert.equal(evaluateSession(failing).status, "failed");
    });
  }
}
