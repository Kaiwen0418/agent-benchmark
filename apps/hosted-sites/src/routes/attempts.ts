import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAttemptReadModel } from "@agentbench/shared";
import { renderAttemptOverview } from "../templates.js";
import { sendJson } from "../runtime/http.js";
import type { HostedAttemptOverviewSession, HostedSession } from "../runtime/types.js";

type AttemptsRouteDeps = {
  publicBaseUrl: string;
  defaultStartPathForApp: (app: string) => string;
  getSession: (url: URL, request: IncomingMessage) => Promise<HostedSession | null>;
  getAttemptOverview: (
    attemptId: string,
  ) => Promise<HostedAttemptReadModel<HostedAttemptOverviewSession> | null>;
  resolveAdvance: (params: {
    attemptId: string;
    currentSessionId: string;
  }) => Promise<{
    attemptId: string;
    currentSessionId: string;
    complete: boolean;
    nextSessionId: string | null;
    nextStartUrl: string | null;
  } | null>;
  badRequest: (response: ServerResponse, message: string) => void;
};

export function createAttemptsRoutes(deps: AttemptsRouteDeps) {
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    const attemptMatch = url.pathname.match(/^\/attempts\/([^/]+)$/);
    if (request.method === "GET" && attemptMatch) {
      const session = await deps.getSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const attemptId = decodeURIComponent(attemptMatch[1]);
      if (session.attemptId !== attemptId) {
        deps.badRequest(response, "Session does not belong to this attempt");
        return true;
      }

      const overview = await deps.getAttemptOverview(attemptId);
      if (!overview) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }

      renderAttemptOverview(overview, session, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }

    const advanceMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/advance$/);
    if (request.method === "GET" && advanceMatch) {
      const session = await deps.getSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const attemptId = decodeURIComponent(advanceMatch[1]);
      const advance = await deps.resolveAdvance({
        attemptId,
        currentSessionId: session.id,
      });
      if (!advance) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }

      sendJson(response, 200, advance);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
