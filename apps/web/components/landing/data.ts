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
  "name": "agentbench-demo",
  "transport": "http",
  "url": "https://agentbench.app/api/mcp"
}`,
  rest: `curl -X POST https://agentbench.app/api/runs \\
  -H "Content-Type: application/json" \\
  -d '{
    "endpoint": "https://agent.local/mcp",
    "benchmark": "web-search"
  }'`,
};
