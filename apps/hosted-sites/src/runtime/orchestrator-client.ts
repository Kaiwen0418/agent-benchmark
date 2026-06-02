import type { HostedAttemptReadModel } from "@agentbench/shared";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import type { HostedAttemptOverviewSession, HostedSession } from "./types.js";

function resolveHostedUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

type OrchestratorClientDeps = {
  baseUrl: string;
  runnerSharedSecret: string | undefined;
  buildFinalState: (session: HostedSession) => unknown;
};

export function createOrchestratorClient(deps: OrchestratorClientDeps) {
  async function postOrchestratorCommand<T>(path: string, payload: Record<string, unknown>) {
    if (!deps.runnerSharedSecret) {
      return null;
    }

    try {
      const response = await fetch(resolveHostedUrl(deps.baseUrl, path), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-runner-secret": deps.runnerSharedSecret,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async function getOrchestratorState<T>(path: string) {
    if (!deps.runnerSharedSecret) {
      return null;
    }

    try {
      const response = await fetch(resolveHostedUrl(deps.baseUrl, path), {
        headers: {
          "x-runner-secret": deps.runnerSharedSecret,
        },
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async function completeSession(session: HostedSession, result: HostedWebScoreResult) {
    if (!session.attemptId) {
      return null;
    }

    return postOrchestratorCommand<HostedWebScoreResult>(
      `/api/attempts/${encodeURIComponent(session.attemptId)}/commands/complete-session`,
      {
        sessionToken: session.token,
        result,
        finalState: deps.buildFinalState(session),
      },
    );
  }

  async function timeoutAttempt(params: {
    attemptId: string;
    runId: string | null;
    expiredSessionId: string;
    expiredTaskSlug: string;
  }) {
    return postOrchestratorCommand<{
      ok: boolean;
      summary: string | null;
    }>(`/api/attempts/${encodeURIComponent(params.attemptId)}/commands/timeout`, params);
  }

  async function getAttemptOverview(attemptId: string) {
    return getOrchestratorState<HostedAttemptReadModel<HostedAttemptOverviewSession>>(
      `/api/attempts/${encodeURIComponent(attemptId)}/state`,
    );
  }

  async function resolveAdvance(params: {
    attemptId: string;
    currentSessionId: string;
  }) {
    return postOrchestratorCommand<{
      attemptId: string;
      currentSessionId: string;
      complete: boolean;
      nextSessionId: string | null;
      nextStartUrl: string | null;
    }>(`/api/attempts/${encodeURIComponent(params.attemptId)}/commands/resolve-advance`, {
      currentSessionId: params.currentSessionId,
    });
  }

  return {
    completeSession,
    timeoutAttempt,
    getAttemptOverview,
    resolveAdvance,
  };
}
