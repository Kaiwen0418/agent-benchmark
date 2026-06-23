import assert from "node:assert/strict";
import test from "node:test";
import { hostedWebSuiteMetadata } from "@agentbench/test-cases";
import { buildInitialSessionState, evaluateSession } from "../../src/runtime/app-registry.js";
import { hostedAppTestSupport } from "../../src/runtime/generated-test-support.js";
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

for (const definition of readDeclaredSessions()) {
  for (const variant of definition.metadata.questionVariants) {
    test(`${definition.app}/${variant.id} has positive, negative, and presentation-invariant scoring`, () => {
      const passing = makeSession(definition, variant);
      hostedAppTestSupport[definition.app].applyPassingState(passing, variant.taskConfig);
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
      hostedAppTestSupport[definition.app].breakPassingState(failing);
      assert.equal(evaluateSession(failing).status, "failed");
    });
  }
}
