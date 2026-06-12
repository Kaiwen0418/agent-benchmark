import crypto from "node:crypto";

export type { Database, Json } from "./database.types.js";

export type HostedAttemptSessionStatus = "created" | "active" | "completed" | "failed" | "expired";

export type HostedWebSessionPersistenceStatus =
  | HostedAttemptSessionStatus
  | "scoring";

export type HostedWebSessionMetadata<TAppState extends Record<string, unknown> = Record<string, unknown>> =
  Record<string, unknown> & {
    schemaVersion?: 1;
    suiteSlug?: string;
    suiteVersion?: string;
    title?: string | null;
    goal?: string;
    startPath?: string | null;
    appState?: TAppState;
  };

export type HostedViewerTokenClaims = {
  scope: "viewer";
  sessionId: string;
  expiresAt: number;
};

function encodeViewerTokenPart(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signViewerTokenPart(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createHostedViewerToken(params: {
  sessionId: string;
  expiresAt: string | number | Date;
  secret: string;
}) {
  const expiresAt = new Date(params.expiresAt).getTime();
  if (!params.secret || !params.sessionId || !Number.isFinite(expiresAt)) {
    throw new Error("Invalid hosted viewer token parameters");
  }

  const payload = encodeViewerTokenPart(
    JSON.stringify({
      scope: "viewer",
      sessionId: params.sessionId,
      expiresAt,
    } satisfies HostedViewerTokenClaims),
  );
  return `view.v1.${payload}.${signViewerTokenPart(payload, params.secret)}`;
}

export function verifyHostedViewerToken(
  token: string,
  secret: string | null | undefined,
  nowMs = Date.now(),
): HostedViewerTokenClaims | null {
  if (!secret) {
    return null;
  }

  const [prefix, version, payload, signature] = token.split(".");
  if (prefix !== "view" || version !== "v1" || !payload || !signature) {
    return null;
  }

  const expected = Buffer.from(signViewerTokenPart(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<HostedViewerTokenClaims>;
    if (
      parsed.scope !== "viewer" ||
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId.length === 0 ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= nowMs
    ) {
      return null;
    }

    return {
      scope: "viewer",
      sessionId: parsed.sessionId,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export type RedisHostedSessionEnvelopeV1<TSession> = {
  schemaVersion: 1;
  session: TSession;
};

export type RedisHostedSessionEnvelopeV2<TSession> = {
  schemaVersion: 2;
  session: TSession;
};

export type HostedAttemptReadSession = {
  id: string;
  sequenceIndex: number;
  status: HostedAttemptSessionStatus;
};

export type HostedAttemptReadModel<TSession extends HostedAttemptReadSession = HostedAttemptReadSession> = {
  attemptId: string;
  activeSessionId: string | null;
  activeSequenceIndex: number | null;
  completedSessionIds: string[];
  progress: {
    total: number;
    completed: number;
  };
  sessions: TSession[];
};

export function buildHostedAttemptReadModel<TSession extends HostedAttemptReadSession>(params: {
  attemptId: string;
  metadata: Record<string, unknown>;
  sessions: TSession[];
}) {
  const completedSessionIds = Array.isArray(params.metadata.completedSessionIds)
    ? params.metadata.completedSessionIds.filter((value): value is string => typeof value === "string")
    : params.sessions
        .filter((session) => session.status === "completed")
        .map((session) => session.id);
  const activeSessionId =
    typeof params.metadata.activeSessionId === "string" ? params.metadata.activeSessionId : null;
  const activeSequenceIndex =
    typeof params.metadata.activeSequenceIndex === "number" ? params.metadata.activeSequenceIndex : null;
  const fallbackActive =
    params.sessions.find((session) => session.id === activeSessionId) ??
    (activeSequenceIndex !== null
      ? params.sessions.find((session) => session.sequenceIndex === activeSequenceIndex)
      : null) ??
    params.sessions.find((session) => session.status === "active") ??
    params.sessions.find((session) => session.status === "created") ??
    null;

  return {
    attemptId: params.attemptId,
    activeSessionId: fallbackActive?.id ?? null,
    activeSequenceIndex: fallbackActive?.sequenceIndex ?? null,
    completedSessionIds,
    progress: {
      total: params.sessions.length,
      completed: completedSessionIds.length,
    },
    sessions: params.sessions,
  } satisfies HostedAttemptReadModel<TSession>;
}
