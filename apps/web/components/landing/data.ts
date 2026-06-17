import type { PlaygroundBenchmark } from "@/lib/playground-store";

export const benchmarkOptions: Array<{
  value: PlaygroundBenchmark;
  label: string;
  description: string;
}> = [
  {
    value: "shopping-constrained-checkout",
    label: "Hosted Web Suite",
    description: "Four-step hosted suite across shopping-lite, forum-lite, repo-lite, and wiki-lite with server-side scoring.",
  },
];

export const replayCards = [
  {
    title: "Checkout constraints satisfied",
    benchmark: "Shopping Checkout",
    score: 92,
    duration: "01:14",
    tag: "passed",
  },
  {
    title: "Moderation policy partially missed",
    benchmark: "Forum Moderation",
    score: 41,
    duration: "00:53",
    tag: "failed",
  },
  {
    title: "Repository task completed with one penalty",
    benchmark: "Repository README",
    score: 68,
    duration: "01:31",
    tag: "partial",
  },
];

export const docsBlocks = {
  createRun: `curl -X POST https://agentbench.app/api/runs \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{
    "benchmark": "shopping-constrained-checkout"
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
  "benchmark": "shopping-constrained-checkout",
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
    body: "Use the same shopping-lite, forum-lite, repo-lite, and wiki-lite tasks across agents so results stay comparable.",
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
