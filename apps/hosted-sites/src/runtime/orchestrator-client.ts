import type { HostedAttemptReadModel } from "@agentbench/shared";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import type { IncomingMessage } from "node:http";
import type { HostedAttemptOverviewSession, HostedSession } from "./types.js";
import type { PersistedHostedSession } from "./session-store.js";

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

  async function getSessionResult(session: HostedSession) {
    if (!session.persisted) {
      return null;
    }
    return getOrchestratorState<HostedWebScoreResult>(
      `/api/sessions/${encodeURIComponent(session.id)}/result`,
    );
  }

  async function recoverSession(params: { token?: string; sessionId?: string }) {
    return postOrchestratorCommand<PersistedHostedSession>("/api/sessions/recover", params);
  }

  async function persistSessionSnapshot(session: HostedSession, metadata: Record<string, unknown>) {
    if (!session.persisted) {
      return null;
    }

    return postOrchestratorCommand<{ ok: true }>(
      `/api/sessions/${encodeURIComponent(session.token)}/commands/snapshot`,
      { metadata },
    );
  }

  async function recordSessionAccess(params: {
    session: HostedSession;
    request: IncomingMessage;
    event: string;
  }) {
    if (!params.session.persisted) {
      return null;
    }

    const forwardedFor = params.request.headers["x-forwarded-for"];
    const rawForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ip =
      typeof rawForwardedFor === "string" && rawForwardedFor.length > 0
        ? rawForwardedFor.split(",")[0]?.trim() ?? null
        : typeof params.request.socket.remoteAddress === "string"
          ? params.request.socket.remoteAddress
          : null;

    return postOrchestratorCommand<{ ok: true }>(
      `/api/sessions/${encodeURIComponent(params.session.token)}/commands/access`,
      {
        event: params.event,
        accessedAt: params.session.lastAccessedAt,
        accessCount: params.session.accessCount,
        firstSeenIp: params.session.firstSeenIp,
        lastSeenIp: params.session.lastSeenIp,
        firstSeenUserAgent: params.session.firstSeenUserAgent,
        lastSeenUserAgent: params.session.lastSeenUserAgent,
        ip,
        userAgent:
          typeof params.request.headers["user-agent"] === "string"
            ? params.request.headers["user-agent"]
            : null,
        referer: typeof params.request.headers.referer === "string" ? params.request.headers.referer : null,
      },
    );
  }

  async function recordHostedEvent(session: HostedSession, payload: Record<string, unknown>) {
    if (!session.persisted) {
      return null;
    }

    return postOrchestratorCommand<{ ok: true }>(
      `/api/sessions/${encodeURIComponent(session.token)}/commands/event`,
      { payload },
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
    getSessionResult,
    recoverSession,
    persistSessionSnapshot,
    recordSessionAccess,
    recordHostedEvent,
    timeoutAttempt,
    getAttemptOverview,
    resolveAdvance,
  };
}
