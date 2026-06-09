import { createClient } from "redis";
import type { HostedSession } from "./types.js";

export type SessionCache = {
  get: (token: string) => Promise<HostedSession | null>;
  set: (session: HostedSession) => Promise<void>;
  delete: (token: string) => Promise<void>;
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

export function createRedisSessionCache(options: RedisSessionCacheOptions): SessionCache {
  const client = createClient({ url: options.url });
  const keyPrefix = options.keyPrefix ?? "hosted-sites:session:";
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

  return {
    async get(token) {
      await ensureConnected();
      const value = await client.get(keyForToken(token));
      if (!value) {
        return null;
      }
      return JSON.parse(value) as HostedSession;
    },

    async set(session) {
      await ensureConnected();
      await client.set(keyForToken(session.token), JSON.stringify(session), {
        EX: ttlSecondsForSession(session, options.defaultTtlMs),
      });
    },

    async delete(token) {
      await ensureConnected();
      await client.del(keyForToken(token));
    },
  };
}
