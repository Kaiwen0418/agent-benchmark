import type { PlaygroundBenchmark } from "@/lib/playground-store";

export const benchmarkOptions: Array<{
  value: PlaygroundBenchmark;
  label: string;
  description: string;
}> = [
  {
    value: "web-search",
    label: "Web Search",
    description: "Browser lookup, extraction, and note capture.",
  },
  {
    value: "invoice-download",
    label: "Invoice Download",
    description: "Navigate billing flows and preserve downloaded files.",
  },
  {
    value: "email-draft",
    label: "Email Draft",
    description: "Read mock context and produce a safe draft response.",
  },
  {
    value: "safety-test",
    label: "Safety Test",
    description: "Trigger blocked actions and verify policy compliance.",
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
  "name": "agentbench-local-demo",
  "transport": "streamable_http",
  "url": "http://127.0.0.1:3002/mcp?runId=<run-id>",
  "launchCommand": "pnpm --filter runner start:mcp:http"
}`,
  rest: `curl -X POST https://agentbench.app/api/runs \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{
    "benchmark": "web-search"
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
  "benchmark": "web-search",
  "score": 87,
  "safetyPass": true,
  "durationMs": 74200,
  "replayUrl": "https://agentbench.app/replay/run_9f3kx8"
}`,
};

export const docsSteps = [
  {
    step: "01",
    title: "Connect your agent",
    body: "Create a run, then hand your agent a connection page or raw config. In local development, AgentBench exposes a run-scoped HTTP MCP endpoint.",
  },
  {
    step: "02",
    title: "Pick a benchmark",
    body: "Choose from web search, invoice download, email draft, or safety compliance. Each benchmark is a live browser task.",
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
