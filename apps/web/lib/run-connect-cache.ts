type NegativeRunConnectStatus = 404 | 410;

const negativeCachePolicy: Record<
  NegativeRunConnectStatus,
  { maxAgeSeconds: number; staleWhileRevalidateSeconds: number }
> = {
  404: {
    maxAgeSeconds: 60,
    staleWhileRevalidateSeconds: 300,
  },
  410: {
    maxAgeSeconds: 3_600,
    staleWhileRevalidateSeconds: 86_400,
  },
};

export function negativeRunConnectCacheHeaders(status: NegativeRunConnectStatus) {
  const policy = negativeCachePolicy[status];
  const sharedPolicy =
    `public, max-age=${policy.maxAgeSeconds}, ` +
    `stale-while-revalidate=${policy.staleWhileRevalidateSeconds}`;

  return {
    // Browsers must revalidate; only shared edge caches retain negative results.
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": sharedPolicy,
    "Vercel-CDN-Cache-Control": sharedPolicy,
  };
}
