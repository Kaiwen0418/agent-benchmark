type HostedSitesEnvironment = {
  HOSTED_SITES_URL?: string;
  HOSTED_SITES_PUBLIC_URL?: string;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveHostedSitesUrls(env: HostedSitesEnvironment) {
  const internalBaseUrl = normalizeBaseUrl(env.HOSTED_SITES_URL ?? "http://localhost:3003");
  const publicBaseUrl = normalizeBaseUrl(env.HOSTED_SITES_PUBLIC_URL ?? internalBaseUrl);

  return {
    internalBaseUrl,
    publicBaseUrl,
  };
}
