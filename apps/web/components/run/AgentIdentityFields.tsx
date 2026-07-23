"use client";

import type { AgentIdentity, ModelCatalogOption } from "@agentbench/protocol";
import {
  agentCatalog,
  catalogSelection,
  OTHER_OPTION_VALUE,
} from "@/lib/agent-catalog";
import { SiteSelect } from "@/components/ui/SiteSelect";
import { ModelAutocompleteInput } from "./ModelAutocompleteInput";

export type AgentIdentityDraft = {
  agentSelection: string;
  customAgent: string;
  agentVersion: string;
  modelInput: string;
  selectedModel: ModelCatalogOption | null;
  reasoningEffort: string;
};

export function identityDraftFromAgent(agent: AgentIdentity | null): AgentIdentityDraft {
  const agentSelection = catalogSelection(agent?.name ?? "", agentCatalog.agents);
  const selectedModel = agent?.model
    ? {
        provider: agent.model.provider,
        modelId: agent.model.id,
        displayName: agent.model.displayName,
        aliases: [],
        status: "active" as const,
        reasoningEfforts: agent.model.reasoningEffort ? [agent.model.reasoningEffort] : [],
        releasedAt: null,
        verifiedAt: null,
      }
    : null;

  return {
    agentSelection,
    customAgent: agentSelection === OTHER_OPTION_VALUE ? agent?.name ?? "" : "",
    agentVersion: agent?.version ?? "latest",
    modelInput: agent?.baseModel ?? "",
    selectedModel,
    reasoningEffort: agent?.model?.reasoningEffort ?? "",
  };
}

export function AgentIdentityFields({
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  value: AgentIdentityDraft;
  onChange: (value: AgentIdentityDraft) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputClass =
    "mt-2 w-full rounded-[0.9rem] border border-[#d8d1c4] bg-white px-3.5 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111] disabled:cursor-not-allowed disabled:bg-[#eeeae2] disabled:text-[#777168]";
  const selectClass = "mt-2";

  return (
    <div className={`grid gap-4 md:grid-cols-3 ${className}`}>
      <label className="text-xs font-medium text-[#4f4a43]">
        Agent
        <SiteSelect
          value={value.agentSelection}
          onValueChange={(agentSelection) => onChange({ ...value, agentSelection })}
          ariaLabel="Agent"
          options={[
            { value: "", label: "Select an agent", disabled: true },
            ...agentCatalog.agents.map((option) => ({ value: option.value, label: option.label })),
            { value: OTHER_OPTION_VALUE, label: "Other" },
          ]}
          disabled={disabled}
          className={selectClass}
        />
        {value.agentSelection === OTHER_OPTION_VALUE ? (
          <input
            required
            maxLength={120}
            value={value.customAgent}
            onChange={(event) => onChange({ ...value, customAgent: event.target.value })}
            disabled={disabled}
            placeholder="Agent name"
            className={inputClass}
          />
        ) : null}
      </label>
      <label className="text-xs font-medium text-[#4f4a43]">
        Agent version
        <input
          required
          maxLength={120}
          value={value.agentVersion}
          onChange={(event) => onChange({ ...value, agentVersion: event.target.value })}
          disabled={disabled}
          placeholder="latest or exact version"
          className={inputClass}
        />
      </label>
      <div className="text-xs font-medium text-[#4f4a43]">
        <label htmlFor="agent-base-model">Base model</label>
        <ModelAutocompleteInput
          id="agent-base-model"
          value={value.modelInput}
          selectedModel={value.selectedModel}
          onChange={(modelInput, selectedModel) => onChange({
            ...value,
            modelInput,
            selectedModel,
            reasoningEffort: selectedModel?.reasoningEfforts.includes(value.reasoningEffort)
              ? value.reasoningEffort
              : "",
          })}
          disabled={disabled}
        />
        {value.selectedModel && value.selectedModel.reasoningEfforts.length > 0 ? (
          <SiteSelect
            value={value.reasoningEffort}
            onValueChange={(reasoningEffort) => onChange({ ...value, reasoningEffort })}
            ariaLabel="Reasoning effort"
            options={[
              { value: "", label: "Default reasoning effort" },
              ...value.selectedModel.reasoningEfforts.map((effort) => ({
                value: effort,
                label: `${effort[0]?.toUpperCase()}${effort.slice(1)} reasoning`,
              })),
            ]}
            disabled={disabled}
            compact
            className="mt-2"
          />
        ) : null}
      </div>
    </div>
  );
}
