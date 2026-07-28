"use client";

import type { ModelCatalogOption } from "@agentbench/protocol";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ModelAutocompleteInputProps = {
  id?: string;
  value: string;
  selectedModel: ModelCatalogOption | null;
  onChange: (value: string, selectedModel: ModelCatalogOption | null) => void;
  disabled?: boolean;
};

function statusLabel(status: ModelCatalogOption["status"]) {
  if (status === "active") return "Active";
  if (status === "preview") return "Preview";
  if (status === "legacy") return "Legacy";
  return "Deprecated";
}

export function ModelAutocompleteInput({
  id,
  value,
  selectedModel,
  onChange,
  disabled = false,
}: ModelAutocompleteInputProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [models, setModels] = useState<ModelCatalogOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || selectedModel) {
      setModels([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/model-options?q=${encodeURIComponent(query)}&limit=12`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to load model suggestions");
          }
          return response.json() as Promise<{ models?: ModelCatalogOption[] }>;
        })
        .then((result) => {
          const nextModels = Array.isArray(result.models) ? result.models : [];
          setModels(nextModels);
          setActiveIndex(-1);
          setOpen(nextModels.length > 0);
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setModels([]);
          }
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selectedModel, value]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function selectModel(model: ModelCatalogOption) {
    onChange(model.displayName, model);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        required
        role="combobox"
        aria-label="Base model"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        maxLength={160}
        value={value}
        onChange={(event) => {
          onChange(event.target.value, null);
          setOpen(true);
        }}
        onFocus={() => {
          if (models.length > 0) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && models.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => current < 0 ? 0 : (current + 1) % models.length);
          } else if (event.key === "ArrowUp" && models.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => current < 0
              ? models.length - 1
              : (current - 1 + models.length) % models.length);
          } else if (event.key === "Enter" && open && models[activeIndex]) {
            event.preventDefault();
            selectModel(models[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        disabled={disabled}
        placeholder="Type a model, for example GPT or Claude"
        className="mt-2 w-full rounded-[0.9rem] border border-[#d8d1c4] bg-white px-3.5 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111] disabled:cursor-not-allowed disabled:bg-[#eeeae2] disabled:text-[#777168]"
      />

      {selectedModel ? (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#756e62]">
          <span>{selectedModel.provider}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{selectedModel.modelId}</span>
          <span aria-hidden="true">·</span>
          <span>{statusLabel(selectedModel.status)}</span>
        </div>
      ) : loading ? (
        <div className="mt-1.5 text-[11px] text-[#756e62]">Searching models…</div>
      ) : null}

      {open && models.length > 0 ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Base model suggestions"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-[90] w-full overflow-hidden rounded-[0.75rem] border border-[#cfc7b9] bg-[#fffdf8] p-1.5 shadow-[0_18px_45px_rgba(35,28,17,0.18)]"
        >
          {models.map((model, index) => (
            <button
              key={`${model.provider}:${model.modelId}`}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={selectedModel?.modelId === model.modelId}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectModel(model)}
              className={cn(
                "flex w-full items-start justify-between gap-4 rounded-[0.55rem] px-3 py-2.5 text-left transition-colors",
                index === activeIndex ? "bg-[#eee9df]" : "hover:bg-[#f4f0e8]",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[#111111]">
                  {model.displayName}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-[#756e62]">
                  {model.modelId}
                </span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#756e62]">
                {model.provider} · {statusLabel(model.status)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
