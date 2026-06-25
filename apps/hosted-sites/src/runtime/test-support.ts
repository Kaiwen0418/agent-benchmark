import type { HostedAppId, HostedSessionFor } from "./types.js";

export type HostedAppTestSupport<TApp extends HostedAppId = HostedAppId> = {
  exampleTaskConfig: Record<string, unknown>;
  applyPassingState: (session: HostedSessionFor<TApp>, config: Record<string, unknown>) => void;
  breakPassingState: (session: HostedSessionFor<TApp>) => void;
};

export function configString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

export function configStringOrNull(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

export function configNumberOrNull(config: Record<string, unknown>, key: string): number | null {
  const value = config[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
