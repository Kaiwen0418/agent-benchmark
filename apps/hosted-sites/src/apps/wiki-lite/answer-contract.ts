import { configString, readQuestionSchemaVersion, readTaskConfig } from "../../runtime/question-config.js";
import type { WikiArticle } from "./types.js";

export type WikiAnswerKind = "date" | "duration" | "currency";
export type WikiAnswerNormalization = "trim" | "trim-casefold" | "trim-casefold-punctuation";

export type WikiAnswerContract = {
  kind: WikiAnswerKind;
  canonicalValue: string;
  normalization: WikiAnswerNormalization;
  sourceArticleSlug: string;
  legacy: boolean;
};

const answerKinds = new Set<WikiAnswerKind>(["date", "duration", "currency"]);
const normalizationPolicies = new Set<WikiAnswerNormalization>([
  "trim",
  "trim-casefold",
  "trim-casefold-punctuation",
]);

function contractString(contract: Record<string, unknown>, key: string) {
  const value = contract[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Generated wiki answerContract.${key} must be a non-empty string.`);
  }
  return value;
}

export function readWikiAnswerContract(metadata: Record<string, unknown>): WikiAnswerContract {
  const schemaVersion = readQuestionSchemaVersion(metadata);
  const taskConfig = readTaskConfig(metadata);
  const targetArticleSlug = configString(taskConfig, "targetArticleSlug");
  const value = taskConfig.answerContract;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (schemaVersion > 2) {
      throw new Error("Generated wiki taskConfig.answerContract is required for schema version 3 or newer.");
    }
    return {
      kind: "date",
      canonicalValue: configString(taskConfig, "expectedAnswer"),
      normalization: "trim-casefold-punctuation",
      sourceArticleSlug: targetArticleSlug,
      legacy: true,
    };
  }

  const contract = value as Record<string, unknown>;
  const kind = contractString(contract, "kind") as WikiAnswerKind;
  const canonicalValue = contractString(contract, "canonicalValue");
  const normalization = contractString(contract, "normalization") as WikiAnswerNormalization;
  const sourceArticleSlug = contractString(contract, "sourceArticleSlug");
  if (!answerKinds.has(kind)) {
    throw new Error(`Unsupported wiki answer kind: ${kind}.`);
  }
  if (!normalizationPolicies.has(normalization)) {
    throw new Error(`Unsupported wiki answer normalization: ${normalization}.`);
  }
  if (sourceArticleSlug !== targetArticleSlug) {
    throw new Error("Generated wiki answerContract.sourceArticleSlug must match targetArticleSlug.");
  }
  return { kind, canonicalValue, normalization, sourceArticleSlug, legacy: false };
}

export function normalizeWikiAnswer(value: string, policy: WikiAnswerNormalization) {
  const trimmed = value.trim();
  if (policy === "trim") {
    return trimmed;
  }
  const casefolded = trimmed.toLocaleLowerCase("en-US");
  return policy === "trim-casefold-punctuation"
    ? casefolded.replaceAll(/[,.]/g, "")
    : casefolded;
}

export function validateWikiAnswerSource(contract: WikiAnswerContract, articles: WikiArticle[]) {
  const article = articles.find((candidate) => candidate.slug === contract.sourceArticleSlug);
  if (!article) {
    throw new Error(`Generated wiki source article does not exist: ${contract.sourceArticleSlug}.`);
  }
  if (!article.body.includes(contract.canonicalValue)) {
    throw new Error(
      `Generated wiki source article ${contract.sourceArticleSlug} does not contain canonical answer ${contract.canonicalValue}.`,
    );
  }
  return article;
}
