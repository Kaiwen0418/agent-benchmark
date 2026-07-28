import type {
  AgentIdentity,
  ModelCatalogOption,
} from "@agentbench/protocol";

export type AgentCatalogOption = {
  value: string;
  label: string;
};

export type AgentCatalog = {
  agents: AgentCatalogOption[];
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
  modelInput: string;
  selectedModel: ModelCatalogOption | null;
  reasoningEffort: string;
}): AgentIdentity | null {
  const name = resolveCatalogValue(input.agentSelection, input.customAgent);
  const version = input.agentVersion.trim();
  const baseModel = input.modelInput.trim();

  if (!name || !version || !baseModel) {
    return null;
  }

  if (!input.selectedModel) {
    return { name, version, baseModel };
  }

  return {
    name,
    version,
    baseModel,
    model: {
      provider: input.selectedModel.provider,
      id: input.selectedModel.modelId,
      displayName: input.selectedModel.displayName,
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    },
  };
}
