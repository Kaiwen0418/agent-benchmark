import assert from "node:assert/strict";
import test from "node:test";
import { configString, readTaskConfig, readUiVariant } from "./question-config.js";

test("generated question metadata is required for scoring", () => {
  assert.throws(() => readTaskConfig(undefined), /missing generated question metadata/);
  assert.throws(() => readTaskConfig({}), /missing questionGeneration metadata/);
  assert.throws(
    () => readTaskConfig({ questionGeneration: { uiVariant: "workspace" } }),
    /missing a generated taskConfig/,
  );
});

test("generated task config fields do not accept fallback values", () => {
  assert.throws(() => configString({}, "expectedAnswer"), /expectedAnswer/);
});

test("UI variant remains independently readable from generated metadata", () => {
  assert.equal(readUiVariant({ questionGeneration: { uiVariant: "sidebar", taskConfig: {} } }), "sidebar");
});
