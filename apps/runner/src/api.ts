import type {
  AppendRunEventInput,
  CompleteRunInput,
  RunnerHeartbeatInput,
  RunnerRegisterInput,
} from "@agentbench/protocol";
import { runnerConfig } from "./config.js";
import type {
  CompleteRunResponse,
  EventResponse,
  HeartbeatRunnerResponse,
  JobResponse,
  RegisterRunnerResponse,
} from "./types.js";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!runnerConfig.webUrl) {
    throw new Error("AGENTBENCH_WEB_URL is required for runner control-plane API requests.");
  }

  if (!runnerConfig.sharedSecret) {
    throw new Error("RUNNER_SHARED_SECRET is required for runner control-plane API requests.");
  }

  const response = await fetch(`${runnerConfig.webUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-runner-secret": runnerConfig.sharedSecret,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: T | { error?: string; message?: string; details?: string } = {} as T;

  if (text) {
    try {
      data = JSON.parse(text) as T | { error?: string; message?: string; details?: string };
    } catch {
      data = {
        error: response.statusText || "Request failed",
        details: text,
      };
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data && typeof data.message === "string"
        ? data.message
        : typeof data === "object" && data && "error" in data && typeof data.error === "string"
          ? data.error
          : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function registerRunner(input: RunnerRegisterInput) {
  return request<RegisterRunnerResponse>("/api/runners/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function heartbeatRunner(input: RunnerHeartbeatInput) {
  return request<HeartbeatRunnerResponse>("/api/runners/heartbeat", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchRunnerJob(runnerId: string) {
  return request<JobResponse>(`/api/runners/jobs?runnerId=${encodeURIComponent(runnerId)}`);
}

export async function appendRunEvent(runId: string, input: AppendRunEventInput) {
  return request<EventResponse>(`/api/runs/${runId}/events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function completeRun(runId: string, input: CompleteRunInput) {
  return request<CompleteRunResponse>(`/api/runs/${runId}/complete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
