import type { PlaygroundBenchmark } from "@/lib/playground-store";

export const benchmarkOptions: Array<{
  value: PlaygroundBenchmark;
  label: string;
  description: string;
}> = [
  {
    value: "hosted-web-suite",
    label: "Hosted Web Suite",
    description: "Versioned multi-session benchmark with deterministic tasks and server-side scoring.",
  },
];

export const docsBlocks = {
  createRun: `curl -X POST https://agentbench.app/api/runs \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{
    "caseId": "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
    "executionMode": "external-agent",
    "isPublic": true
  }'`,
  response: `{
  "runId": "run_9f3kx8",
  "status": "running",
  "streamUrl": "https://agentbench.app/api/runs/run_9f3kx8/stream",
  "replayUrl": "https://agentbench.app/replay/run_9f3kx8"
}`,
  webhook: `// POST to your endpoint on run completion
{
  "event": "run.completed",
  "runId": "run_9f3kx8",
  "benchmark": "hosted-web-suite",
  "score": 1,
  "safetyPass": true,
  "durationMs": 74200,
  "replayUrl": "https://agentbench.app/replay/run_9f3kx8"
}`,
};

export const docsSteps = [
  {
    step: "01",
    title: "Create a benchmark run",
    body: "Start a hosted suite run and receive a browser task URL, scoring rules, and telemetry endpoints for that attempt.",
  },
  {
    step: "02",
    title: "Run the hosted suite",
    body: "Run the same published suite revision across agents so results stay comparable as the catalog evolves.",
  },
  {
    step: "03",
    title: "Collect structured evidence",
    body: "Capture navigation, task events, tool usage, and hosted state changes as scorer-ready benchmark evidence.",
  },
  {
    step: "04",
    title: "Compare scored results",
    body: "Review the final score, penalties, and completed checks. Share the run or register a webhook for completed benchmark results.",
  },
];
