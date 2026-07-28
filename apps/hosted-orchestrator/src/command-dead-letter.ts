import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@agentbench/shared";

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
  supabase: SupabaseClient<Database>,
  retention: CommandDeadLetterRetention,
  currentTime = Date.now(),
) {
  const args = {
    p_dead_before: new Date(currentTime - retention.deadRetentionMs).toISOString(),
    p_resolved_before: new Date(currentTime - retention.resolvedRetentionMs).toISOString(),
    p_limit: retention.batchSize,
    p_max_rows: retention.maxRows,
  };
  let deleted = 0;

  for (let batch = 0; batch < retention.maxBatches; batch += 1) {
    const { data, error } = await supabase.rpc("prune_orchestrator_command_dead_letters_v2", args);
    if (error) {
      throw error;
    }
    const batchDeleted = data ?? 0;
    deleted += batchDeleted;
    if (batchDeleted < retention.batchSize) {
      break;
    }
  }

  return deleted;
}

export async function scrubCommandDeadLetters(
  supabase: SupabaseClient<Database>,
  batchSize: number,
) {
  const { data, error } = await supabase.rpc("scrub_orchestrator_command_dead_letters", {
    p_limit: batchSize,
  });
  if (error) {
    throw error;
  }
  return data ?? 0;
}
