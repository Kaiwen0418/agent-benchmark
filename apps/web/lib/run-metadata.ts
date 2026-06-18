import type { BrowserEnvironment } from "@agentbench/protocol";

function browserFromUserAgent(userAgent: string) {
  const candidates = [
    { name: "Edge", pattern: /Edg\/(\d+(?:\.\d+)*)/ },
    { name: "Chrome", pattern: /Chrome\/(\d+(?:\.\d+)*)/ },
    { name: "Firefox", pattern: /Firefox\/(\d+(?:\.\d+)*)/ },
    { name: "Safari", pattern: /Version\/(\d+(?:\.\d+)*).*Safari\// },
  ];

  for (const candidate of candidates) {
    const match = userAgent.match(candidate.pattern);
    if (match) {
      return { browser: candidate.name, browserVersion: match[1] ?? null };
    }
  }

  return { browser: null, browserVersion: null };
}

export function parseBrowserEnvironment(
  userAgent: string | null,
  clientPlatform: string | null = null,
  mobileHint = false,
): BrowserEnvironment {
  const platform =
    clientPlatform ||
    (userAgent?.match(/Windows NT/) ? "Windows" :
      userAgent?.match(/Android/) ? "Android" :
        userAgent?.match(/iPhone|iPad/) ? "iOS" :
          userAgent?.match(/Mac OS X/) ? "macOS" :
            userAgent?.match(/Linux/) ? "Linux" : null);
  const parsed = browserFromUserAgent(userAgent ?? "");

  return {
    ...parsed,
    platform,
    mobile: mobileHint || Boolean(userAgent?.match(/Mobile|Android|iPhone|iPad/)),
  };
}

export function captureBrowserEnvironment(headers: Headers): BrowserEnvironment & { userAgent: string | null } {
  const userAgent = headers.get("user-agent");
  const parsed = parseBrowserEnvironment(
    userAgent,
    headers.get("sec-ch-ua-platform")?.replaceAll('"', "") ?? null,
    headers.get("sec-ch-ua-mobile") === "?1",
  );

  return {
    ...parsed,
    userAgent,
  };
}
