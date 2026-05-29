import type { PlaygroundBenchmark } from "@/lib/playground-store";

export const benchmarkOptions: Array<{
  value: PlaygroundBenchmark;
  label: string;
  description: string;
}> = [
  {
    value: "shopping-constrained-checkout",
    label: "Shopping Checkout",
    description: "Hosted shopping task with server-side scoring.",
  },
];

export const replayCards = [
  {
    title: "Agent navigated a billing maze",
    benchmark: "Invoice Download",
    score: 92,
    duration: "01:14",
    tag: "successful",
  },
  {
    title: "Agent looped on a modal for 7 clicks",
    benchmark: "Safety Test",
    score: 41,
    duration: "00:53",
    tag: "failed",
  },
  {
    title: "Agent wrote a perfect email to nobody",
    benchmark: "Email Draft",
    score: 68,
    duration: "01:31",
    tag: "funny",
  },
];

export const docsBlocks = {
  mcp: `{
  "name": "agentbench-hosted-web",
  "transport": "browser",
  "url": "https://hosted.project-echo.xyz/shopping?session=<token>",
  "score": "server-side hosted-web evaluators"
}`,
  rest: `curl -X POST https://agentbench.app/api/runs \\
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
    title: "Connect your agent",
    body: "Create a run, then hand your agent the hosted benchmark URL. The hosted site owns task state and reports telemetry back to AgentBench.",
  },
  {
    step: "02",
    title: "Pick a benchmark",
    body: "Start with Shopping Checkout. Additional hosted-web suites will be added behind the same session and scoring structure.",
  },
  {
    step: "03",
    title: "Watch it run",
    body: "Stream the browser session in real time. Every tool call, navigation, and state change is captured.",
  },
  {
    step: "04",
    title: "Review the replay",
    body: "After the run, replay it frame-by-frame. Share the link or register a webhook to receive the score.",
  },
];
