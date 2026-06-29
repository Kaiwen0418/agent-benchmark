// Helpers for hard repo-lite variants: coherent multi-file edits plus a
// simulated CI status surfaced to the agent. CI checks are an agent-facing
// signal computed from current file contents; the authoritative scoring gate is
// the set of file edits verified in evaluate.ts.
import type { RepoFile } from "./types.js";

export type AdditionalFileEdit = {
  filePath: string;
  expectedText: string;
  forbiddenText?: string;
};

export type CiCheck = {
  name: string;
  token: string;
  files: string[];
};

export type CiStatus = {
  name: string;
  passed: boolean;
  missingFiles: string[];
};

function containsStandaloneText(content: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?:$|[^A-Za-z0-9_])`).test(content);
}

export function readAdditionalFileEdits(config: Record<string, unknown>): AdditionalFileEdit[] {
  const value = config.additionalFileEdits;
  if (!Array.isArray(value)) return [];
  const edits: AdditionalFileEdit[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.filePath !== "string" || typeof record.expectedText !== "string") continue;
    edits.push({
      filePath: record.filePath,
      expectedText: record.expectedText,
      forbiddenText: typeof record.forbiddenText === "string" ? record.forbiddenText : undefined,
    });
  }
  return edits;
}

export function readCiChecks(config: Record<string, unknown>): CiCheck[] {
  const value = config.ciChecks;
  if (!Array.isArray(value)) return [];
  const checks: CiCheck[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.token !== "string") continue;
    const files = Array.isArray(record.files)
      ? record.files.filter((file): file is string => typeof file === "string" && file.length > 0)
      : [];
    if (files.length === 0) continue;
    checks.push({ name: record.name, token: record.token, files });
  }
  return checks;
}

// A file edit is satisfied when the file exists, contains the required text, and
// does not contain the forbidden text as a standalone token.
export function additionalEditSatisfied(files: RepoFile[], edit: AdditionalFileEdit): boolean {
  const file = files.find((candidate) => candidate.path === edit.filePath);
  if (!file) return false;
  if (!file.content.includes(edit.expectedText)) return false;
  if (edit.forbiddenText && containsStandaloneText(file.content, edit.forbiddenText)) return false;
  return true;
}

// A CI check passes when its token appears in every listed file.
export function computeCiStatus(files: RepoFile[], check: CiCheck): CiStatus {
  const missingFiles = check.files.filter((path) => {
    const file = files.find((candidate) => candidate.path === path);
    return !file || !file.content.includes(check.token);
  });
  return { name: check.name, passed: missingFiles.length === 0, missingFiles };
}

export function computeCiStatuses(files: RepoFile[], checks: CiCheck[]): CiStatus[] {
  return checks.map((check) => computeCiStatus(files, check));
}
