import { createClient } from "redis";
import type { RedisHostedSessionEnvelopeV2 } from "@agentbench/shared";
import { getHostedAppDefinition, listHostedAppDefinitions, resolveHostedAppId } from "./app-registry.js";
import type { HostedAppId, HostedAppPersistenceState, HostedSession } from "./types.js";

export type SessionCache = {
  get: (token: string) => Promise<HostedSession | null>;
  set: (session: HostedSession) => Promise<void>;
  delete: (token: string) => Promise<void>;
  cancelByIds: (sessionIds: string[]) => Promise<void>;
  close?: () => Promise<void>;
};

type RedisSessionCacheOptions = {
  url: string;
  keyPrefix?: string;
  defaultTtlMs: number;
};

function ttlSecondsForSession(session: HostedSession, defaultTtlMs: number) {
  const ttlMs = session.expiresAt ? new Date(session.expiresAt).getTime() - Date.now() : defaultTtlMs;
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHostedSessionStatus(value: unknown) {
  return (
    value === "created" ||
    value === "active" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "expired"
  );
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isHostedAppSessionState(app: HostedAppId, value: unknown) {
  const stateKeys = getHostedAppDefinition(app).stateKeys as readonly (keyof HostedAppPersistenceState)[];
  return isRecord(value) && stateKeys.every((key) => Array.isArray(value[key]));
}

function hasHostedSessionFields(value: Record<string, unknown>) {
  return (
    typeof value.id === "string" &&
    typeof value.token === "string" &&
    isNullableString(value.runId) &&
    isNullableString(value.caseId) &&
    isNullableString(value.attemptId) &&
    isNullableString(value.callbackSecret) &&
    typeof value.app === "string" &&
    typeof value.suiteSlug === "string" &&
    typeof value.suiteVersion === "string" &&
    typeof value.taskSlug === "string" &&
    typeof value.taskVersion === "string" &&
    typeof value.sequenceIndex === "number" &&
    typeof value.weight === "number" &&
    typeof value.required === "boolean" &&
    isNullableString(value.title) &&
    typeof value.goal === "string" &&
    isNullableString(value.startPath) &&
    typeof value.seedVersion === "string" &&
    isHostedSessionStatus(value.status) &&
    isNullableString(value.expiresAt) &&
    typeof value.accessCount === "number" &&
    isNullableString(value.lastAccessedAt) &&
    isNullableString(value.firstSeenIp) &&
    isNullableString(value.lastSeenIp) &&
    isNullableString(value.firstSeenUserAgent) &&
    isNullableString(value.lastSeenUserAgent) &&
    typeof value.createdAt === "string" &&
    isRecord(value.metadata) &&
    Array.isArray(value.events) &&
    typeof value.persisted === "boolean"
  );
}

function normalizeHostedSession(value: unknown): HostedSession | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!hasHostedSessionFields(value)) {
    return null;
  }

  const app = resolveHostedAppId(value.app as string);
  const stateKeys = getHostedAppDefinition(app).stateKeys as readonly (keyof HostedAppPersistenceState)[];

  if (isHostedAppSessionState(app, value.state)) {
    return { ...value, app } as HostedSession;
  }

  if (!stateKeys.every((key) => Array.isArray(value[key]))) {
    return null;
  }

  const state = Object.fromEntries(stateKeys.map((key) => [key, value[key]]));
  const migrated: Record<string, unknown> = { ...value, app, state };
  for (const key of listHostedAppDefinitions().flatMap((definition) => definition.stateKeys)) {
    delete migrated[key];
  }
  return migrated as HostedSession;
}

export function encodeRedisHostedSession(session: HostedSession) {
  return JSON.stringify({
    schemaVersion: 2,
    session,
  } satisfies RedisHostedSessionEnvelopeV2<HostedSession>);
}

export function decodeRedisHostedSession(value: string) {
  const parsed: unknown = JSON.parse(value);
  const candidate =
    isRecord(parsed) &&
    (parsed.schemaVersion === 1 || parsed.schemaVersion === 2) &&
    "session" in parsed
      ? parsed.session
      : parsed;
  const session = normalizeHostedSession(candidate);

  if (!session) {
    throw new Error("Invalid Redis hosted session payload");
  }

  return session;
}

export function createRedisSessionCache(options: RedisSessionCacheOptions): SessionCache {
  const client = createClient({ url: options.url });
  const keyPrefix = options.keyPrefix ?? "hosted-sites:session:";
  const sessionIdKeyPrefix = `${keyPrefix}id:`;
  let connectPromise: Promise<unknown> | null = null;

  client.on("error", (error) => {
    console.error("[hosted-sites] redis session cache error", error);
  });

  async function ensureConnected() {
    if (client.isOpen) {
      return;
    }

    connectPromise ??= client.connect();
    await connectPromise;
  }

  function keyForToken(token: string) {
    return `${keyPrefix}${token}`;
  }

  function keyForSessionId(sessionId: string) {
    return `${sessionIdKeyPrefix}${sessionId}`;
  }

  async function writeSession(session: HostedSession) {
    const ttl = ttlSecondsForSession(session, options.defaultTtlMs);
    await client.multi()
      .set(keyForToken(session.token), encodeRedisHostedSession(session), { EX: ttl })
      .set(keyForSessionId(session.id), session.token, { EX: ttl })
      .exec();
  }

  return {
    async get(token) {
      await ensureConnected();
      const value = await client.get(keyForToken(token));
      if (!value) {
        return null;
      }
      return decodeRedisHostedSession(value);
    },

    async set(session) {
      await ensureConnected();
      await writeSession(session);
    },

    async delete(token) {
      await ensureConnected();
      await client.del(keyForToken(token));
    },

    async cancelByIds(sessionIds) {
      await ensureConnected();
      const remaining = new Set(sessionIds);
      for (const sessionId of sessionIds) {
        const token = await client.get(keyForSessionId(sessionId));
        if (!token) continue;
        const value = await client.get(keyForToken(token));
        if (!value) continue;
        const session = decodeRedisHostedSession(value);
        await writeSession({ ...session, status: "cancelled", expiresAt: null });
        remaining.delete(sessionId);
      }

      if (remaining.size === 0) return;
      for await (const keys of client.scanIterator({ MATCH: `${keyPrefix}*`, COUNT: 100 })) {
        for (const key of keys) {
          if (key.startsWith(sessionIdKeyPrefix)) continue;
          const value = await client.get(key);
          if (!value) continue;
          const session = decodeRedisHostedSession(value);
          if (!remaining.has(session.id)) continue;
          await writeSession({ ...session, status: "cancelled", expiresAt: null });
          remaining.delete(session.id);
        }
        if (remaining.size === 0) return;
      }
    },

    async close() {
      if (client.isOpen) await client.close();
    },
  };
}
