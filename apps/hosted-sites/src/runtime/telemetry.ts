import type { HostedWebScoreResult } from "@agentbench/scoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HostedSession } from "./types.js";

type TelemetryDeps = {
  now: () => string;
  agentbenchWebUrl: string;
  runnerSharedSecret: string | undefined;
  getSupabaseAdmin: () => SupabaseClient | null | undefined;
  persistSessionSnapshot?: (session: HostedSession) => Promise<void>;
};

export function createTelemetryRuntime(deps: TelemetryDeps) {
  async function recordEvent(session: HostedSession, payload: Record<string, unknown>) {
    session.events.push({
      ...payload,
      createdAt: deps.now(),
    });

    await deps.persistSessionSnapshot?.(session);

    if (!session.persisted || !session.runId) {
      return;
    }

    const supabase = deps.getSupabaseAdmin();
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("hosted_web_events").insert({
      session_id: session.id,
      run_id: session.runId,
      attempt_id: session.attemptId,
      type: typeof payload.type === "string" ? payload.type : "hosted.event",
      name:
        typeof payload.name === "string"
          ? payload.name
          : typeof payload.type === "string"
            ? payload.type
            : null,
      payload,
    });

    if (error) {
      console.error("[hosted-sites] failed to persist hosted event", error);
    }
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
