import type { ServerResponse } from "node:http";
import {
  deterministicFaultSchema,
  type DeterministicFault,
} from "@agentbench/test-cases";

type FaultAction = DeterministicFault["trigger"]["action"];
type FaultKind = DeterministicFault["kind"];

type FaultRuntimeState = {
  schemaVersion: 1;
  occurrences: Record<FaultAction, number>;
  appliedFaultIds: string[];
  recoveredFaultIds: string[];
  pendingRecoveryFaultId: string | null;
};

export type DeterministicFaultObservation = {
  changed: boolean;
  injected: { kind: FaultKind } | null;
  recovered: { kind: FaultKind } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readSchedule(metadata: Record<string, unknown>): DeterministicFault[] {
  const raw = metadata.scenarioFaultSchedule;
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.faults)) {
    return [];
  }

  const faults: DeterministicFault[] = [];
  for (const candidate of raw.faults) {
    const parsed = deterministicFaultSchema.safeParse(candidate);
    if (!parsed.success) return [];
    faults.push(parsed.data);
  }
  return faults;
}

function emptyState(): FaultRuntimeState {
  return {
    schemaVersion: 1,
    occurrences: { read: 0, mutation: 0, navigation: 0 },
    appliedFaultIds: [],
    recoveredFaultIds: [],
    pendingRecoveryFaultId: null,
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readState(metadata: Record<string, unknown>): FaultRuntimeState {
  const raw = metadata.scenarioFaultState;
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !isRecord(raw.occurrences)) {
    return emptyState();
  }
  const occurrences = raw.occurrences;

  const count = (action: FaultAction) => {
    const value = occurrences[action];
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
  };
  return {
    schemaVersion: 1,
    occurrences: {
      read: count("read"),
      mutation: count("mutation"),
      navigation: count("navigation"),
    },
    appliedFaultIds: readStringArray(raw.appliedFaultIds),
    recoveredFaultIds: readStringArray(raw.recoveredFaultIds),
    pendingRecoveryFaultId:
      typeof raw.pendingRecoveryFaultId === "string" ? raw.pendingRecoveryFaultId : null,
  };
}

export function observeDeterministicFault(
  metadata: Record<string, unknown>,
  actions: FaultAction[],
): DeterministicFaultObservation {
  const faults = readSchedule(metadata);
  if (faults.length === 0 || actions.length === 0) {
    return { changed: false, injected: null, recovered: null };
  }

  const uniqueActions = [...new Set(actions)];
  const state = readState(metadata);
  for (const action of uniqueActions) {
    state.occurrences[action] += 1;
  }

  const pendingFault = faults.find((fault) => fault.id === state.pendingRecoveryFaultId);
  if (pendingFault) {
    if (uniqueActions.includes(pendingFault.trigger.action)) {
      if (!state.recoveredFaultIds.includes(pendingFault.id)) {
        state.recoveredFaultIds.push(pendingFault.id);
      }
      state.pendingRecoveryFaultId = null;
      metadata.scenarioFaultState = state;
      return { changed: true, injected: null, recovered: { kind: pendingFault.kind } };
    }

    metadata.scenarioFaultState = state;
    return { changed: true, injected: null, recovered: null };
  }

  const dueFault = faults.find((fault) =>
    uniqueActions.includes(fault.trigger.action)
    && state.occurrences[fault.trigger.action] === fault.trigger.occurrence
    && !state.appliedFaultIds.includes(fault.id));
  if (!dueFault) {
    metadata.scenarioFaultState = state;
    return { changed: true, injected: null, recovered: null };
  }

  state.appliedFaultIds.push(dueFault.id);
  state.pendingRecoveryFaultId = dueFault.requiredRecovery ? dueFault.id : null;
  metadata.scenarioFaultState = state;
  return { changed: true, injected: { kind: dueFault.kind }, recovered: null };
}

const faultCopy: Record<FaultKind, { status: number; title: string; message: string }> = {
  "stale-view": {
    status: 409,
    title: "This view is stale",
    message: "The underlying state changed. Reload the current page before continuing.",
  },
  "rejected-mutation": {
    status: 409,
    title: "The change was not saved",
    message: "Review the current state and retry the change. No mutation was applied.",
  },
  "interrupted-navigation": {
    status: 503,
    title: "Navigation was interrupted",
    message: "The destination is temporarily unavailable. Retry this navigation.",
  },
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderRecoverableFault(
  response: ServerResponse,
  kind: FaultKind,
  retryUrl: string,
) {
  const copy = faultCopy[kind];
  response.writeHead(copy.status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": "0",
  });
  response.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title}</title></head>
  <body>
    <main>
      <h1>${copy.title}</h1>
      <p>${copy.message}</p>
      <a href="${escapeHtml(retryUrl)}">Retry</a>
    </main>
  </body>
</html>`);
}
