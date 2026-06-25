"use client";

import type { AgentIdentity } from "@agentbench/protocol";
import { useEffect, useState } from "react";
import {
  agentCatalog as fallbackCatalog,
  catalogSelection,
  OTHER_OPTION_VALUE,
  type AgentCatalog,
} from "@/lib/agent-catalog";
import { SiteSelect } from "@/components/ui/SiteSelect";

export type AgentIdentityDraft = {
  agentSelection: string;
  customAgent: string;
  agentVersion: string;
  modelSelection: string;
  customModel: string;
};

export function identityDraftFromAgent(agent: AgentIdentity | null): AgentIdentityDraft {
  const agentSelection = catalogSelection(agent?.name ?? "", fallbackCatalog.agents);
  const modelSelection = catalogSelection(agent?.baseModel ?? "", fallbackCatalog.models);

  return {
    agentSelection,
    customAgent: agentSelection === OTHER_OPTION_VALUE ? agent?.name ?? "" : "",
    agentVersion: agent?.version ?? "latest",
    modelSelection,
    customModel: modelSelection === OTHER_OPTION_VALUE ? agent?.baseModel ?? "" : "",
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
  const [catalog, setCatalog] = useState<AgentCatalog>(fallbackCatalog);

  useEffect(() => {
    let active = true;

    void fetch("/api/agent-options", { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load agent options");
        }
        return response.json() as Promise<AgentCatalog>;
      })
      .then((result) => {
        if (active) {
          setCatalog(result);
        }
      })
      .catch(() => {
        // The bundled catalog keeps the form usable if the options endpoint is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const inputClass =
    "mt-2 w-full rounded-[0.9rem] border border-[#d8d1c4] bg-white px-3.5 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111] disabled:cursor-not-allowed disabled:bg-[#eeeae2] disabled:text-[#777168]";
  const selectClass = "mt-2";

  return (
    <div className={`grid gap-4 md:grid-cols-3 ${className}`}>
      <label className="text-xs font-medium text-[#4f4a43]">
        Agent
        <SiteSelect
          required
          value={value.agentSelection}
          onChange={(event) => onChange({ ...value, agentSelection: event.target.value })}
          disabled={disabled}
          className={selectClass}
        >
          <option value="" disabled>Select an agent</option>
          {catalog.agents.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
          <option value={OTHER_OPTION_VALUE}>Other</option>
        </SiteSelect>
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
      <label className="text-xs font-medium text-[#4f4a43]">
        Base model
        <SiteSelect
          required
          value={value.modelSelection}
          onChange={(event) => onChange({ ...value, modelSelection: event.target.value })}
          disabled={disabled}
          className={selectClass}
        >
          <option value="" disabled>Select a model</option>
          {catalog.models.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} · {option.provider}
            </option>
          ))}
          <option value={OTHER_OPTION_VALUE}>Other</option>
        </SiteSelect>
        {value.modelSelection === OTHER_OPTION_VALUE ? (
          <input
            required
            maxLength={160}
            value={value.customModel}
            onChange={(event) => onChange({ ...value, customModel: event.target.value })}
            disabled={disabled}
            placeholder="Model name"
            className={inputClass}
          />
        ) : null}
      </label>
    </div>
  );
}
