import { appendRunEvent, completeRun, fetchRunnerJob, heartbeatRunner, registerRunner } from "./api.js";
import { runnerConfig } from "./config.js";
import { executePlaywrightJob } from "./playwright-execution.js";
import type { RunnerJob } from "./types.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLiveViewUrl(runId: string) {
  if (!runnerConfig.webUrl) {
    return null;
  }

  return `${runnerConfig.webUrl}/runs/${runId}/live`;
}

async function executeJob(job: RunnerJob) {
  const liveViewUrl = buildLiveViewUrl(job.runId);
  const runJob: RunnerJob = {
    ...job,
    liveViewUrl: liveViewUrl ?? job.liveViewUrl,
  };

  console.log(`[runner] accepted job ${job.runId} for case ${job.caseId}`);
  const result = await executePlaywrightJob(runJob, async (event) => {
    await appendRunEvent(job.runId, event);
    console.log(`[runner] event ${event.type} -> run ${job.runId}`);
  });
  await completeRun(job.runId, result.completion);
  console.log(
    `[runner] completed run ${job.runId} with status ${result.completion.status} and score ${result.completion.score ?? "--"}`,
  );
}

async function main() {
  console.log(`[runner] booting ${runnerConfig.name}`);
  console.log(`[runner] target web: ${runnerConfig.webUrl}`);

  const registration = await registerRunner({
    name: runnerConfig.name,
    capacity: runnerConfig.capacity,
  });

  const runnerId = registration.runner.id;
  console.log(`[runner] registered as ${runnerId}`);

  let shuttingDown = false;
  let activeRunId: string | null = null;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    try {
      await heartbeatRunner({
        runnerId,
        currentLoad: 0,
        status: "offline",
      });
    } catch (error) {
      console.error("[runner] failed to send offline heartbeat", error);
    }
  };

  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });

  setInterval(() => {
    void heartbeatRunner({
      runnerId,
      currentLoad: activeRunId ? 1 : 0,
      status: activeRunId ? "busy" : "online",
    }).catch((error) => {
      console.error("[runner] heartbeat failed", error);
    });
  }, runnerConfig.heartbeatMs);

  while (!shuttingDown) {
    if (activeRunId) {
      await sleep(runnerConfig.pollMs);
      continue;
    }

    try {
      const { job } = await fetchRunnerJob(runnerId);
      if (!job) {
        await sleep(runnerConfig.pollMs);
        continue;
      }

      activeRunId = job.runId;
      await heartbeatRunner({
        runnerId,
        currentLoad: 1,
        status: "busy",
      });

      try {
        await executeJob(job);
      } finally {
        activeRunId = null;
        await heartbeatRunner({
          runnerId,
          currentLoad: 0,
          status: "online",
        });
      }
    } catch (error) {
      console.error("[runner] poll loop failed", error);
      await sleep(runnerConfig.pollMs);
    }
  }
}

void main().catch((error) => {
  console.error("[runner] fatal error", error);
  process.exit(1);
});
