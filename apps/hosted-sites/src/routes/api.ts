import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedWebScoreResult } from "@agentbench/scoring";
import type { HostedSession } from "../runtime/types.js";
import { sendJson } from "../runtime/http.js";

type ApiRoutesDeps = {
  publicBaseUrl: string;
  createHostedSession: (params: {
    runId?: string | null;
    caseId?: string | null;
    attemptId?: string | null;
    callbackSecret?: string | null;
    suiteSlug?: string;
    suiteVersion?: string;
    app?: string;
    taskSlug?: string;
    taskVersion?: string;
    sequenceIndex?: number;
    weight?: number;
    required?: boolean;
    title?: string | null;
    goal?: string | null;
    startPath?: string | null;
    seedVersion?: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<HostedSession>;
  getSession: (url: URL, request: IncomingMessage) => Promise<HostedSession | null>;
  getLiveSessionByToken: (token: string) => HostedSession | undefined;
  recordEvent: (session: HostedSession, payload: Record<string, unknown>) => Promise<void>;
  forwardRunEvent: (session: HostedSession, type: string, payload: Record<string, unknown>) => Promise<void>;
  telemetryRunEventType: (type: string) => string;
  evaluateSession: (session: HostedSession) => HostedWebScoreResult;
  completeSession: (session: HostedSession, result: HostedWebScoreResult) => Promise<HostedWebScoreResult | null>;
  readJson: (request: IncomingMessage) => Promise<Record<string, unknown>>;
  badRequest: (response: ServerResponse, message: string) => void;
  notFound: (response: ServerResponse) => void;
};

export function createApiRoutes(deps: ApiRoutesDeps) {
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (request.method === "POST" && url.pathname === "/api/sessions") {
      const input = await deps.readJson(request);
      const runId = typeof input.runId === "string" ? input.runId : null;
      const caseId = typeof input.caseId === "string" ? input.caseId : null;
      const attemptId = typeof input.attemptId === "string" ? input.attemptId : null;
      const callbackSecret = typeof input.callbackSecret === "string" ? input.callbackSecret : null;
      const suiteSlug = typeof input.suiteSlug === "string" ? input.suiteSlug : undefined;
      const suiteVersion = typeof input.suiteVersion === "string" ? input.suiteVersion : undefined;
      const app = typeof input.app === "string" ? input.app : undefined;
      const taskSlug = typeof input.taskSlug === "string" ? input.taskSlug : undefined;
      const taskVersion = typeof input.taskVersion === "string" ? input.taskVersion : "v1";
      const sequenceIndex = typeof input.sequenceIndex === "number" ? input.sequenceIndex : 0;
      const weight = typeof input.weight === "number" ? input.weight : 1;
      const required = typeof input.required === "boolean" ? input.required : true;
      const title = typeof input.title === "string" ? input.title : null;
      const goal = typeof input.goal === "string" ? input.goal : null;
      const startPath = typeof input.startPath === "string" ? input.startPath : null;
      const seedVersion = typeof input.seedVersion === "string" ? input.seedVersion : null;
      const metadata =
        input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? (input.metadata as Record<string, unknown>)
          : {};
      const session = await deps.createHostedSession({
        runId,
        caseId,
        attemptId,
        callbackSecret,
        suiteSlug,
        suiteVersion,
        app,
        taskSlug,
        taskVersion,
        sequenceIndex,
        weight,
        required,
        title,
        goal,
        startPath,
        seedVersion,
        metadata,
      });
      await deps.recordEvent(session, {
        type: "session.created",
        taskSlug: session.taskSlug,
        runId: session.runId,
      });
      const startUrl = `${deps.publicBaseUrl}${session.startPath ?? "/shopping"}?session=${encodeURIComponent(session.token)}`;
      await deps.forwardRunEvent(session, "hosted.session.created", {
        source: "hosted-sites",
        sessionId: session.id,
        attemptId: session.attemptId,
        app: session.app,
        taskSlug: session.taskSlug,
        sequenceIndex: session.sequenceIndex,
        startUrl,
      });
      sendJson(response, 201, {
        sessionId: session.id,
        attemptId: session.attemptId,
        token: session.token,
        app: session.app,
        taskSlug: session.taskSlug,
        taskVersion: session.taskVersion,
        sequenceIndex: session.sequenceIndex,
        weight: session.weight,
        required: session.required,
        startUrl,
        goal: session.goal,
        title: session.title,
        legacy: true,
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/telemetry") {
      const input = await deps.readJson(request);
      const telemetryUrl = new URL(url);
      if (typeof input.session === "string") {
        telemetryUrl.searchParams.set("session", input.session);
      }
      const session = await deps.getSession(telemetryUrl, request);
      if (!session) {
        deps.badRequest(response, "Unknown session");
        return true;
      }
      const telemetryType = typeof input.type === "string" ? input.type : "hosted.event";
      const payload = {
        type: telemetryType,
        payload: input.payload,
        url: input.url,
        title: input.title,
      };
      await deps.recordEvent(session, payload);
      await deps.forwardRunEvent(session, deps.telemetryRunEventType(telemetryType), {
        source: "hosted-sites",
        sessionId: session.id,
        taskSlug: session.taskSlug,
        ...payload,
      });
      sendJson(response, 201, { ok: true });
      return true;
    }

    const scoreMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/score$/);
    if (request.method === "GET" && scoreMatch) {
      const token = decodeURIComponent(scoreMatch[1]);
      const session = deps.getLiveSessionByToken(token);
      if (!session) {
        deps.notFound(response);
        return true;
      }
      sendJson(response, 200, deps.evaluateSession(session));
      return true;
    }

    const completeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/complete$/);
    if (request.method === "POST" && completeMatch) {
      const token = decodeURIComponent(completeMatch[1]);
      const session = deps.getLiveSessionByToken(token);
      if (!session) {
        deps.notFound(response);
        return true;
      }
      const result = deps.evaluateSession(session);
      const completion = await deps.completeSession(session, result);
      if (!completion) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }
      sendJson(response, 200, completion);
      return true;
    }

    return false;
  }

  return {
    handle,
  };
}
