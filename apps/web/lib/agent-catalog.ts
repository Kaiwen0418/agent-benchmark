import type { AgentIdentity } from "@agentbench/protocol";

export type AgentCatalogOption = {
  value: string;
  label: string;
};

export type ModelCatalogOption = AgentCatalogOption & {
  provider: string;
};

export type AgentCatalog = {
  agents: AgentCatalogOption[];
  models: ModelCatalogOption[];
};

export const OTHER_OPTION_VALUE = "__other__";

export const agentCatalog: AgentCatalog = {
  agents: [
    { value: "Codex", label: "Codex" },
    { value: "Claude Code", label: "Claude Code" },
    { value: "Cursor", label: "Cursor" },
    { value: "OpenHands", label: "OpenHands" },
    { value: "Cline", label: "Cline" },
    { value: "Aider", label: "Aider" },
    { value: "Browser Use", label: "Browser Use" },
  ],
  models: [
    { value: "GPT-5", label: "GPT-5", provider: "OpenAI" },
    { value: "Claude Sonnet", label: "Claude Sonnet", provider: "Anthropic" },
    { value: "Claude Opus", label: "Claude Opus", provider: "Anthropic" },
    { value: "Gemini 2.5 Pro", label: "Gemini 2.5 Pro", provider: "Google" },
    { value: "Gemini 2.5 Flash", label: "Gemini 2.5 Flash", provider: "Google" },
    { value: "DeepSeek", label: "DeepSeek", provider: "DeepSeek" },
    { value: "Qwen", label: "Qwen", provider: "Alibaba Cloud" },
    { value: "Llama", label: "Llama", provider: "Meta" },
  ],
};

export function catalogSelection(value: string, options: AgentCatalogOption[]) {
  if (!value) {
    return "";
  }
  return options.some((option) => option.value === value) ? value : OTHER_OPTION_VALUE;
}

export function resolveCatalogValue(selection: string, customValue: string) {
  return (selection === OTHER_OPTION_VALUE ? customValue : selection).trim();
}

export function resolveAgentIdentity(input: {
  agentSelection: string;
  customAgent: string;
  agentVersion: string;
  modelSelection: string;
  customModel: string;
}): AgentIdentity | null {
  const name = resolveCatalogValue(input.agentSelection, input.customAgent);
  const version = input.agentVersion.trim();
  const baseModel = resolveCatalogValue(input.modelSelection, input.customModel);

  return name && version && baseModel ? { name, version, baseModel } : null;
}
