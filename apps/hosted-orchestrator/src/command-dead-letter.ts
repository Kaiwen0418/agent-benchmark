import type { Json } from "@agentbench/shared";

const knownSensitiveKeys = new Set([
  "apikey",
  "authorization",
  "callbacksecret",
  "cookie",
  "password",
  "servicerolekey",
  "sharedsecret",
  "sessiontoken",
  "token",
  "writetoken",
]);

function normalizedKey(key: string) {
  return key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isSensitiveKey(key: string) {
  const normalized = normalizedKey(key);
  return (
    knownSensitiveKeys.has(normalized) ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("token")
  );
}

export function redactCommandPayload(value: unknown, depth = 0): Json {
  if (depth >= 20) {
    return "[REDACTED:MAX_DEPTH]";
  }
  if (typeof value === "string") {
    return redactCommandErrorMessage(value);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactCommandPayload(item, depth + 1));
  }
  if (typeof value !== "object") {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, item]) => [key, redactCommandPayload(item, depth + 1)]),
  );
}

export function redactCommandErrorMessage(message: string) {
  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:api[_-]?key|callback[_-]?secret|session|session[_-]?token|token|write[_-]?token)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /((?:api[_-]?key|callback[_-]?secret|password|session[_-]?token|shared[_-]?secret|token|write[_-]?token)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 1_000);
}

export type CommandDeadLetterRetention = {
  deadRetentionMs: number;
  resolvedRetentionMs: number;
  batchSize: number;
  maxBatches: number;
  maxRows: number;
};

export type CommandDeadLetterMaintenancePersistence = {
  prune: (input: {
    deadBefore: string;
    resolvedBefore: string;
    limit: number;
    maxRows: number;
  }) => Promise<number>;
  scrub: (limit: number) => Promise<number>;
};

export function compactCommandPayload(value: unknown, maxBytes: number): Json {
  const redacted = redactCommandPayload(value);
  const serialized = JSON.stringify(redacted);
  const originalBytes = Buffer.byteLength(serialized, "utf8");
  if (originalBytes <= maxBytes) {
    return redacted;
  }

  return {
    truncated: true,
    originalBytes,
    topLevelKeys:
      redacted && typeof redacted === "object" && !Array.isArray(redacted)
        ? Object.keys(redacted).slice(0, 25)
        : [],
  };
}

export async function pruneCommandDeadLetters(
  persistence: CommandDeadLetterMaintenancePersistence,
  retention: CommandDeadLetterRetention,
  currentTime = Date.now(),
) {
  const input = {
    deadBefore: new Date(currentTime - retention.deadRetentionMs).toISOString(),
    resolvedBefore: new Date(currentTime - retention.resolvedRetentionMs).toISOString(),
    limit: retention.batchSize,
    maxRows: retention.maxRows,
  };
  let deleted = 0;

  for (let batch = 0; batch < retention.maxBatches; batch += 1) {
    const batchDeleted = await persistence.prune(input);
    deleted += batchDeleted;
    if (batchDeleted < retention.batchSize) {
      break;
    }
  }

  return deleted;
}

export async function scrubCommandDeadLetters(
  persistence: CommandDeadLetterMaintenancePersistence,
  batchSize: number,
) {
  return persistence.scrub(batchSize);
}
