function configuredOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function resolvePublicWebOrigin(request: Request) {
  const configured = configuredOrigin(
    process.env.AUTH_URL ?? process.env.AGENTBENCH_WEB_PUBLIC_URL ?? process.env.AGENTBENCH_WEB_URL,
  );
  return configured ?? new URL(request.url).origin;
}
