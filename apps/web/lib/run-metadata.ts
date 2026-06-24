import type { AgentIdentity, BrowserEnvironment, SubmitRunMetadataInput } from "@agentbench/protocol";
import type { Database } from "@agentbench/shared";

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

export function buildRunMetadataUpdate(params: {
  currentMetadata: Record<string, unknown>;
  currentStatus: Database["public"]["Tables"]["benchmark_runs"]["Row"]["status"];
  startedAt: string | null;
  input: SubmitRunMetadataInput;
  browserEnvironment: Record<string, unknown>;
  now: string;
}): Database["public"]["Tables"]["benchmark_runs"]["Update"] {
  return {
    agent_name: params.input.name,
    agent_version: params.input.version,
    base_model: params.input.baseModel,
    browser_environment: params.browserEnvironment,
    metadata: {
      ...params.currentMetadata,
      ...params.input.metadata,
      identityReportedAt: params.now,
      identitySource: "connection-page",
    },
    started_at: params.startedAt ?? params.now,
    status: params.currentStatus === "waiting_for_agent" ? "agent_connected" : params.currentStatus,
  };
}

export function hasRegisteredRunMetadata(run: {
  agent: AgentIdentity | null;
  status: string;
  metadata: Record<string, unknown>;
}) {
  return Boolean(
    run.agent &&
    (run.metadata.identitySource === "connection-page" || run.status !== "waiting_for_agent"),
  );
}

export function buildInitialRunMetadata(params: {
  agent: AgentIdentity | undefined;
  browserEnvironment: BrowserEnvironment;
  now: string;
}): Database["public"]["Tables"]["benchmark_runs"]["Update"] {
  if (!params.agent) {
    return {
      browser_environment: params.browserEnvironment,
    };
  }

  return {
    agent_name: params.agent.name,
    agent_version: params.agent.version,
    base_model: params.agent.baseModel,
    browser_environment: params.browserEnvironment,
    metadata: { identityReportedAt: params.now, identitySource: "run-creation" },
  };
}
