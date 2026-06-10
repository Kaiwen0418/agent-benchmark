import type { HostedSession } from "./types.js";

type TelemetryDeps = {
  now: () => string;
  agentbenchWebUrl: string;
  runnerSharedSecret: string | undefined;
  persistSessionSnapshot?: (session: HostedSession) => Promise<void>;
  persistHostedEvent?: (session: HostedSession, payload: Record<string, unknown>) => Promise<unknown>;
};

export function createTelemetryRuntime(deps: TelemetryDeps) {
  async function recordEvent(session: HostedSession, payload: Record<string, unknown>) {
    session.events.push({
      ...payload,
      createdAt: deps.now(),
    });

    await deps.persistSessionSnapshot?.(session);

    await deps.persistHostedEvent?.(session, payload);
  }

  async function forwardRunEvent(session: HostedSession, type: string, payload: Record<string, unknown>) {
    if (!deps.agentbenchWebUrl || !session.runId) {
      return;
    }

    await fetch(`${deps.agentbenchWebUrl}/api/runs/${encodeURIComponent(session.runId)}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session.callbackSecret || deps.runnerSharedSecret
          ? { "x-runner-secret": session.callbackSecret ?? deps.runnerSharedSecret ?? "" }
          : {}),
      },
      body: JSON.stringify({
        type,
        payload,
      }),
    }).catch(() => undefined);
  }

  function telemetryRunEventType(type: string) {
    if (type === "page.load") {
      return "hosted.page.load";
    }

    if (type === "click" || type === "input" || type === "submit" || type === "navigation") {
      return "hosted.action";
    }

    if (type === "task.signal") {
      return "hosted.task_signal";
    }

    return "hosted.action";
  }

  return {
    recordEvent,
    forwardRunEvent,
    telemetryRunEventType,
  };
}
