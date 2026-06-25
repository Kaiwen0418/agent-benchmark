"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentIdentity } from "@agentbench/protocol";
import { resolveAgentIdentity } from "@/lib/agent-catalog";
import { AgentIdentityFields, identityDraftFromAgent } from "./AgentIdentityFields";

export function RunMetadataForm({
  runId,
  initialAgent,
  initialMetadata,
  locked,
  onSaved,
}: {
  runId: string;
  initialAgent: AgentIdentity | null;
  initialMetadata: Record<string, unknown>;
  locked: boolean;
  onSaved?: (agent: AgentIdentity, metadata: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState(() => identityDraftFromAgent(initialAgent));
  const [metadata, setMetadata] = useState(() => JSON.stringify(initialMetadata, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    let parsedMetadata: unknown;
    try {
      parsedMetadata = metadata.trim() ? JSON.parse(metadata) : {};
    } catch {
      setMessage({ tone: "error", text: "Metadata must be valid JSON." });
      return;
    }

    if (!parsedMetadata || typeof parsedMetadata !== "object" || Array.isArray(parsedMetadata)) {
      setMessage({ tone: "error", text: "Metadata must be a JSON object." });
      return;
    }

    const resolvedIdentity = resolveAgentIdentity(identity);
    if (!resolvedIdentity) {
      setMessage({ tone: "error", text: "Agent, version, and base model are required." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/runs/${runId}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...resolvedIdentity, metadata: parsedMetadata }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.message ?? result?.error ?? "Unable to save agent metadata.");
      }

      setMessage({ tone: "success", text: "Agent metadata saved. You can start the benchmark." });
      onSaved?.(resolvedIdentity, parsedMetadata as Record<string, unknown>);
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to save agent metadata." });
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-[0.9rem] border border-[#d8d1c4] bg-white px-3.5 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111] disabled:cursor-not-allowed disabled:bg-[#eeeae2] disabled:text-[#777168]";

  return (
    <section className="mt-8 rounded-[1.4rem] border border-[#ddd6ca] bg-[#f1eee7] p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Agent Metadata</div>
      <p className="mt-2 text-sm leading-7 text-[#585248]">
        Register the agent identity before opening the active benchmark.
      </p>
      <form onSubmit={submit} className="mt-5">
        <AgentIdentityFields value={identity} onChange={setIdentity} disabled={locked} />
        <label className="mt-4 block text-xs font-medium text-[#4f4a43]">
          Additional metadata (JSON)
          <textarea
            rows={5}
            value={metadata}
            onChange={(event) => setMetadata(event.target.value)}
            disabled={locked}
            spellCheck={false}
            className={`${inputClass} resize-y font-mono leading-6`}
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={locked || submitting}
            className="rounded-full bg-[#111111] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#8d887f]"
          >
            {submitting ? "Saving..." : initialAgent ? "Update Metadata" : "Register Agent"}
          </button>
          {locked ? <span className="text-xs text-[#756e62]">Metadata is locked because this run has ended.</span> : null}
          {message ? (
            <span className={`text-xs ${message.tone === "success" ? "text-[#1f6b35]" : "text-[#8a2d1f]"}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
