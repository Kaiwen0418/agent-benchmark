import assert from "node:assert/strict";
import test from "node:test";
import {
  agentCatalog,
  catalogSelection,
  OTHER_OPTION_VALUE,
  resolveAgentIdentity,
} from "../../lib/agent-catalog";

test("agent and model catalog values are unique", () => {
  assert.equal(new Set(agentCatalog.agents.map((option) => option.value)).size, agentCatalog.agents.length);
  assert.equal(new Set(agentCatalog.models.map((option) => option.value)).size, agentCatalog.models.length);
});

test("known catalog values remain selected", () => {
  assert.equal(catalogSelection("", agentCatalog.agents), "");
  assert.equal(catalogSelection("Codex", agentCatalog.agents), "Codex");
  assert.equal(catalogSelection("Private Agent", agentCatalog.agents), OTHER_OPTION_VALUE);
});

test("resolves catalog and custom identity values", () => {
  assert.deepEqual(
    resolveAgentIdentity({
      agentSelection: "Codex",
      customAgent: "",
      agentVersion: "1.2.3",
      modelSelection: OTHER_OPTION_VALUE,
      customModel: "private-model-v2",
    }),
    { name: "Codex", version: "1.2.3", baseModel: "private-model-v2" },
  );
});

test("rejects incomplete identity drafts", () => {
  assert.equal(
    resolveAgentIdentity({
      agentSelection: OTHER_OPTION_VALUE,
      customAgent: "",
      agentVersion: "latest",
      modelSelection: "GPT-5",
      customModel: "",
    }),
    null,
  );
});
