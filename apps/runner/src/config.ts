function readNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function readRequired(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export const runnerConfig = {
  webUrl: readRequired("AGENTBENCH_WEB_URL").replace(/\/$/, ""),
  sharedSecret: readRequired("RUNNER_SHARED_SECRET"),
  name: process.env.RUNNER_NAME ?? "mock-runner-local",
  capacity: readNumber("RUNNER_CAPACITY", 1),
  heartbeatMs: readNumber("RUNNER_HEARTBEAT_MS", 5000),
  pollMs: readNumber("RUNNER_POLL_MS", 2500),
};
