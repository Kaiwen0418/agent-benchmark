import type { HostedAppId, HostedSessionFor } from "./types.js";

export type HostedAppTestSupport<TApp extends HostedAppId = HostedAppId> = {
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
