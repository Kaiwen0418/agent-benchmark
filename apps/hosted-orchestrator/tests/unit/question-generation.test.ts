import assert from "node:assert/strict";
import test from "node:test";
import {
  hostedTestcaseApps,
  hostedWebCapabilitySuiteMetadata,
} from "@agentbench/test-cases";
import { generateAttemptQuestions } from "../../src/question-generation.js";

const wikiQuestionVariants = hostedTestcaseApps["wiki-lite"].variantPools.release;

const session = {
  app: "wiki-lite",
  taskSlug: "wiki-answer",
  sequenceIndex: 0,
  title: "Wiki",
  goal: "Legacy fixed question that must never be used",
  seedVersion: "wiki-v1",
  metadata: {
    questionVariants: wikiQuestionVariants,
  },
};

test("question generation is deterministic for the same seed", () => {
  const first = generateAttemptQuestions([session], "attempt-seed");
  const second = generateAttemptQuestions([session], "attempt-seed");
  assert.deepEqual(first, second);
  assert.equal("questionVariants" in first.sessions[0].metadata, false);
});

test("question generation persists the selected hidden task config", () => {
  const generated = generateAttemptQuestions([session], "another-seed").sessions[0];
  const selection = generated.metadata.questionGeneration as Record<string, unknown>;
  assert.equal(typeof generated.goal, "string");
  assert.notEqual(generated.goal, session.goal);
  assert.equal(selection.generationSeed, "another-seed");
  assert.equal(selection.schemaVersion, 3);
  assert.equal(typeof selection.variantId, "string");
  assert.match(String(selection.uiVariant), /^(workspace|sidebar|compact|dashboard|editorial)$/);
  assert.match(String(selection.uiTheme), /^(light|dark)$/);
  assert.equal(typeof selection.taskConfig, "object");
});

test("different attempt seeds can select different variants", () => {
  const selected = new Set(
    Array.from({ length: 32 }, (_, index) => {
      const generated = generateAttemptQuestions([session], `attempt-${index}`).sessions[0];
      const selection = generated.metadata.questionGeneration as Record<string, unknown>;
      return selection.variantId;
    }),
  );
  assert.deepEqual(selected, new Set(wikiQuestionVariants.map((variant) => variant.id)));
});

test("UI presentation selection is deterministic and covers every layout and theme", () => {
  const first = generateAttemptQuestions([session], "stable-ui-seed").sessions[0];
  const second = generateAttemptQuestions([session], "stable-ui-seed").sessions[0];
  const firstSelection = first.metadata.questionGeneration as Record<string, unknown>;
  const secondSelection = second.metadata.questionGeneration as Record<string, unknown>;
  assert.equal(firstSelection.uiVariant, secondSelection.uiVariant);
  assert.equal(firstSelection.uiTheme, secondSelection.uiTheme);

  const layouts = new Set(
    Array.from({ length: 128 }, (_, index) => {
      const generated = generateAttemptQuestions([session], `ui-seed-${index}`).sessions[0];
      return (generated.metadata.questionGeneration as Record<string, unknown>).uiVariant;
    }),
  );
  assert.deepEqual(layouts, new Set(["workspace", "sidebar", "compact", "dashboard", "editorial"]));

  const themes = new Set(
    Array.from({ length: 128 }, (_, index) => {
      const generated = generateAttemptQuestions([session], `theme-seed-${index}`).sessions[0];
      return (generated.metadata.questionGeneration as Record<string, unknown>).uiTheme;
    }),
  );
  assert.deepEqual(themes, new Set(["light", "dark"]));
});

test("question generation rejects missing, singleton, and duplicate variant pools", () => {
  assert.throws(
    () => generateAttemptQuestions([{ ...session, metadata: {} }], "missing-pool"),
    /missing metadata.questionVariants/,
  );
  assert.throws(
    () => generateAttemptQuestions([{ ...session, metadata: { questionVariants: [session.metadata.questionVariants[0]] } }], "single-pool"),
    /at least two question variants/,
  );
  assert.throws(
    () => generateAttemptQuestions([{
      ...session,
      metadata: { questionVariants: [session.metadata.questionVariants[0], session.metadata.questionVariants[0]] },
    }], "duplicate-pool"),
    /ids must be unique/,
  );
});

test("hard v1.1.0 seed sweep reaches every declared variant deterministically", () => {
  const selectedByTask = new Map(
    hostedWebCapabilitySuiteMetadata.sessions.map((definition) => [
      definition.taskSlug,
      new Set<string>(),
    ]),
  );
  for (let index = 0; index < 1024; index += 1) {
    const seed = `capability-sweep-${index}`;
    const first = generateAttemptQuestions(hostedWebCapabilitySuiteMetadata.sessions, seed);
    const second = generateAttemptQuestions(hostedWebCapabilitySuiteMetadata.sessions, seed);
    assert.deepEqual(second, first);
    for (const generated of first.sessions) {
      const selection = generated.metadata.questionGeneration as Record<string, unknown>;
      selectedByTask.get(generated.taskSlug)?.add(String(selection.variantId));
    }
  }

  for (const definition of hostedWebCapabilitySuiteMetadata.sessions) {
    assert.deepEqual(
      selectedByTask.get(definition.taskSlug),
      new Set(definition.metadata.questionVariants.map((variant) => variant.id)),
      definition.taskSlug,
    );
  }
});
