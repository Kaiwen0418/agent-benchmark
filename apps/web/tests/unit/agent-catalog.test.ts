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
      modelInput: "private-model-v2",
      selectedModel: null,
      reasoningEffort: "",
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
      modelInput: "GPT-5",
      selectedModel: null,
      reasoningEffort: "",
    }),
    null,
  );
});

test("resolves a catalog selection with provider identity and reasoning effort", () => {
  assert.deepEqual(
    resolveAgentIdentity({
      agentSelection: "Codex",
      customAgent: "",
      agentVersion: "0.144.0",
      modelInput: "GPT-5.6 Sol",
      selectedModel: {
        provider: "openai",
        modelId: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        aliases: ["gpt-5.6"],
        status: "active",
        reasoningEfforts: ["low", "medium", "high"],
        releasedAt: null,
        verifiedAt: "2026-07-09T00:00:00.000Z",
      },
      reasoningEffort: "medium",
    }),
    {
      name: "Codex",
      version: "0.144.0",
      baseModel: "GPT-5.6 Sol",
      model: {
        provider: "openai",
        id: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        reasoningEffort: "medium",
      },
    },
  );
});
