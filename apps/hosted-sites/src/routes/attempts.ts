import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../runtime/http.js";
import type { HostedSession } from "../runtime/types.js";

type AttemptsRouteDeps = {
  getSession: (url: URL, request: IncomingMessage) => Promise<HostedSession | null>;
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
    if (request.method === "GET" && url.pathname === "/api/sessions/advance") {
      const session = await deps.getSession(url, request);
      if (!session) {
        deps.badRequest(response, "Missing or invalid session");
        return true;
      }

      const attemptId = session.attemptId;
      if (!attemptId) {
        deps.badRequest(response, "Session is not attached to an attempt");
        return true;
      }

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
