import { verifyHostedViewerToken } from "@agentbench/shared";

export function isHostedViewerMutation(
  method: string | undefined,
  token: string | null,
  secret: string | undefined,
) {
  return method !== "GET" && Boolean(token && verifyHostedViewerToken(token, secret));
}
