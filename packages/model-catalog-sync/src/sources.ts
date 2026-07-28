import type { ModelCatalogStatus } from "@agentbench/protocol";

export type DiscoveredModel = {
  provider: string;
  modelId: string;
  displayName: string;
  aliases: string[];
  family: string | null;
  status: ModelCatalogStatus;
  reasoningEfforts: string[];
  releasedAt: string | null;
  source: string;
  sourceUrl: string;
  sourcePriority: number;
  benchmarkPopularity: number;
  verified: boolean;
};

export class MissingModelSourceCredentialError extends Error {
  constructor(source: string, envName: string) {
    super(`${source} sync requires ${envName}.`);
    this.name = "MissingModelSourceCredentialError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoFromUnix(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1_000).toISOString()
    : null;
}

const providerAliases: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  "google-ai-studio": "google",
  gemini: "google",
  "x-ai": "xai",
  xai: "xai",
  moonshotai: "moonshot",
  moonshot: "moonshot",
  kimi: "moonshot",
  "z-ai": "zai",
  zhipu: "zai",
  glm: "zai",
  deepseek: "deepseek",
};

export function normalizeModelProvider(value: string) {
  const normalized = value.toLowerCase().trim();
  return providerAliases[normalized] ?? normalized;
}

export function modelStatusFromId(modelId: string): ModelCatalogStatus {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("deprecated")) return "deprecated";
  if (normalized.includes("preview") || normalized.includes("experimental") || normalized.includes("exp-")) {
    return "preview";
  }
  return "active";
}

export function humanizeModelId(modelId: string) {
  const withoutProvider = modelId.includes("/") ? modelId.split("/").at(-1)! : modelId;
  return withoutProvider
    .replace(/^gpt-/i, "GPT-")
    .replace(/^glm-/i, "GLM-")
    .replace(/^kimi-/i, "Kimi-")
    .replace(/^grok-/i, "Grok-")
    .replace(/^claude-/i, "Claude-")
    .replace(/^gemini-/i, "Gemini-")
    .replace(/^deepseek-/i, "DeepSeek-")
    .split("-")
    .map((part, index) => index === 0 ? part : part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
    .replace(/^GPT /, "GPT-")
    .replace(/^GLM /, "GLM-");
}

function isRelevantTextModel(modelId: string) {
  const id = modelId.toLowerCase();
  return ![
    "embedding",
    "moderation",
    "whisper",
    "transcribe",
    "tts",
    "audio",
    "realtime",
    "image",
    "dall-e",
    "sora",
  ].some((fragment) => id.includes(fragment));
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Model source ${url} returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

async function fetchOpenAiCompatibleModels(config: {
  source: string;
  provider: string;
  url: string;
  apiKeyEnv: string;
  sourceUrl: string;
}) {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new MissingModelSourceCredentialError(config.source, config.apiKeyEnv);
  }

  const payload = await fetchJson(config.url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return parseOpenAiCompatiblePayload(payload, {
    source: config.source,
    provider: config.provider,
    sourceUrl: config.sourceUrl,
  });
}

export function parseOpenAiCompatiblePayload(
  payload: unknown,
  config: Pick<DiscoveredModel, "source" | "provider" | "sourceUrl">,
) {
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return data.flatMap((item): DiscoveredModel[] => {
    if (!isRecord(item)) return [];
    const modelId = stringValue(item.id);
    if (!modelId || !isRelevantTextModel(modelId)) return [];
    return [{
      provider: normalizeModelProvider(config.provider),
      modelId,
      displayName: stringValue(item.display_name) ?? humanizeModelId(modelId),
      aliases: [],
      family: null,
      status: modelStatusFromId(modelId),
      reasoningEfforts: [],
      releasedAt: isoFromUnix(item.created),
      source: config.source,
      sourceUrl: config.sourceUrl,
      sourcePriority: 10,
      benchmarkPopularity: 0,
      verified: true,
    }];
  });
}

async function fetchAnthropicModels(): Promise<DiscoveredModel[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingModelSourceCredentialError("anthropic", "ANTHROPIC_API_KEY");
  }
  const payload = await fetchJson("https://api.anthropic.com/v1/models?limit=1000", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  return parseAnthropicPayload(payload);
}

export function parseAnthropicPayload(payload: unknown) {
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return data.flatMap((item): DiscoveredModel[] => {
    if (!isRecord(item)) return [];
    const modelId = stringValue(item.id);
    if (!modelId) return [];
    return [{
      provider: "anthropic",
      modelId,
      displayName: stringValue(item.display_name) ?? humanizeModelId(modelId),
      aliases: [],
      family: null,
      status: modelStatusFromId(modelId),
      reasoningEfforts: [],
      releasedAt: stringValue(item.created_at),
      source: "anthropic",
      sourceUrl: "https://platform.claude.com/docs/en/api/models-list",
      sourcePriority: 10,
      benchmarkPopularity: 0,
      verified: true,
    }];
  });
}

async function fetchGeminiModels(): Promise<DiscoveredModel[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingModelSourceCredentialError("google", "GEMINI_API_KEY");
  }
  const payload = await fetchJson(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    { headers: { "x-goog-api-key": apiKey } },
  );
  return parseGeminiPayload(payload);
}

export function parseGeminiPayload(payload: unknown) {
  const data = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
  return data.flatMap((item): DiscoveredModel[] => {
    if (!isRecord(item)) return [];
    const resourceName = stringValue(item.name);
    const modelId = resourceName?.replace(/^models\//, "") ?? null;
    const methods = Array.isArray(item.supportedGenerationMethods)
      ? item.supportedGenerationMethods.filter((value): value is string => typeof value === "string")
      : [];
    if (!modelId || (methods.length > 0 && !methods.includes("generateContent"))) return [];
    return [{
      provider: "google",
      modelId,
      displayName: stringValue(item.displayName) ?? humanizeModelId(modelId),
      aliases: [],
      family: stringValue(item.baseModelId),
      status: modelStatusFromId(modelId),
      reasoningEfforts: [],
      releasedAt: null,
      source: "google",
      sourceUrl: "https://ai.google.dev/api/models",
      sourcePriority: 10,
      benchmarkPopularity: 0,
      verified: true,
    }];
  });
}

async function fetchOpenRouterModels(): Promise<DiscoveredModel[]> {
  const payload = await fetchJson("https://openrouter.ai/api/v1/models?output_modalities=text");
  return parseOpenRouterPayload(payload);
}

export function parseOpenRouterPayload(payload: unknown) {
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return data.flatMap((item): DiscoveredModel[] => {
    if (!isRecord(item)) return [];
    const openRouterId = stringValue(item.id);
    if (!openRouterId || !openRouterId.includes("/")) return [];
    const [rawProvider, ...modelParts] = openRouterId.split("/");
    const provider = normalizeModelProvider(rawProvider);
    if (!["openai", "anthropic", "google", "xai", "moonshot", "zai", "deepseek"].includes(provider)) {
      return [];
    }
    const modelId = modelParts.join("/");
    if (!modelId || !isRelevantTextModel(modelId)) return [];
    return [{
      provider,
      modelId,
      displayName: stringValue(item.name)?.replace(/^[^:]+:\s*/, "") ?? humanizeModelId(modelId),
      aliases: [openRouterId],
      family: null,
      status: modelStatusFromId(modelId),
      reasoningEfforts: [],
      releasedAt: isoFromUnix(item.created),
      source: "openrouter",
      sourceUrl: "https://openrouter.ai/docs/guides/overview/models",
      sourcePriority: 30,
      benchmarkPopularity: 0,
      verified: false,
    }];
  });
}

async function fetchLiteLlmModels(): Promise<DiscoveredModel[]> {
  const sourceUrl =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  const payload = await fetchJson(sourceUrl);
  return parseLiteLlmPayload(payload, sourceUrl);
}

export function parseLiteLlmPayload(payload: unknown, sourceUrl = "litellm-fixture") {
  if (!isRecord(payload)) return [];

  return Object.entries(payload).flatMap(([rawModelId, value]): DiscoveredModel[] => {
    if (!isRecord(value) || rawModelId === "sample_spec") return [];
    const rawProvider = stringValue(value.litellm_provider) ?? rawModelId.split("/")[0] ?? "";
    const provider = normalizeModelProvider(rawProvider);
    if (!["openai", "anthropic", "google", "xai", "moonshot", "zai", "deepseek"].includes(provider)) {
      return [];
    }
    const modelId = rawModelId.includes("/") ? rawModelId.split("/").slice(1).join("/") : rawModelId;
    if (!modelId || !isRelevantTextModel(modelId)) return [];
    return [{
      provider,
      modelId,
      displayName: humanizeModelId(modelId),
      aliases: rawModelId === modelId ? [] : [rawModelId],
      family: null,
      status: modelStatusFromId(modelId),
      reasoningEfforts: [],
      releasedAt: null,
      source: "litellm",
      sourceUrl,
      sourcePriority: 40,
      benchmarkPopularity: 0,
      verified: false,
    }];
  });
}

export const modelCatalogSources = {
  openai: () => fetchOpenAiCompatibleModels({
    source: "openai",
    provider: "openai",
    url: "https://api.openai.com/v1/models",
    apiKeyEnv: "OPENAI_API_KEY",
    sourceUrl: "https://developers.openai.com/api/docs/models",
  }),
  anthropic: fetchAnthropicModels,
  google: fetchGeminiModels,
  xai: () => fetchOpenAiCompatibleModels({
    source: "xai",
    provider: "xai",
    url: "https://api.x.ai/v1/models",
    apiKeyEnv: "XAI_API_KEY",
    sourceUrl: "https://docs.x.ai/developers/rest-api-reference/inference/models",
  }),
  kimi: () => fetchOpenAiCompatibleModels({
    source: "kimi",
    provider: "moonshot",
    url: "https://api.moonshot.cn/v1/models",
    apiKeyEnv: "MOONSHOT_API_KEY",
    sourceUrl: "https://platform.kimi.com/docs/api/list-models",
  }),
  deepseek: () => fetchOpenAiCompatibleModels({
    source: "deepseek",
    provider: "deepseek",
    url: "https://api.deepseek.com/models",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    sourceUrl: "https://api-docs.deepseek.com/api/list-models",
  }),
  openrouter: fetchOpenRouterModels,
  litellm: fetchLiteLlmModels,
} satisfies Record<string, () => Promise<DiscoveredModel[]>>;

export type ModelCatalogSourceName = keyof typeof modelCatalogSources;
