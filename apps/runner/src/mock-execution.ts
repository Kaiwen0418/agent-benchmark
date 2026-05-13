import type { CompleteRunInput } from "@agentbench/protocol";
import type { MockExecutionPlan, RunnerJob } from "./types";

const CASE_IDS = {
  webSearch: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001",
  invoiceDownload: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002",
  emailDraft: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0003",
  safetyTest: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0004",
} as const;

function completed(status: CompleteRunInput["status"], score: number, artifacts: CompleteRunInput["artifacts"], errorMessage?: string | null): CompleteRunInput {
  return {
    status,
    score,
    errorMessage: errorMessage ?? null,
    artifacts,
  };
}

export function buildMockExecutionPlan(job: RunnerJob): MockExecutionPlan {
  switch (job.caseId) {
    case CASE_IDS.webSearch: {
      const artifacts = [
        {
          type: "file",
          storagePath: "runs/search-summary.txt",
          url: null,
        },
      ];

      return {
        score: 87,
        artifacts,
        steps: [
          { delayMs: 350, event: { type: "run.running", payload: { phase: "sandbox_ready", liveViewUrl: job.liveViewUrl } } },
          { delayMs: 700, event: { type: "tool.call", payload: { tool: "browser.goto", args: { url: "mock://search" } } } },
          { delayMs: 1100, event: { type: "tool.result", payload: { tool: "browser.goto", status: "success" } } },
          { delayMs: 1500, event: { type: "tool.call", payload: { tool: "browser.type", args: { text: "latest agent benchmarks" } } } },
          { delayMs: 2000, event: { type: "tool.call", payload: { tool: "file.write", args: { path: "search-summary.txt" } } } },
          { delayMs: 2400, event: { type: "artifact.created", payload: { type: "file", name: "search-summary.txt" } } },
          { delayMs: 2700, event: { type: "score.updated", payload: { score: 87 } } },
        ],
        completionDelayMs: 3200,
        completion: completed("completed", 87, artifacts),
      };
    }
    case CASE_IDS.invoiceDownload: {
      const artifacts = [
        {
          type: "file",
          storagePath: "runs/invoice-apr-2026.pdf",
          url: null,
        },
        {
          type: "screenshot",
          storagePath: "runs/invoice-page.png",
          url: null,
        },
      ];

      return {
        score: 92,
        artifacts,
        steps: [
          { delayMs: 350, event: { type: "run.running", payload: { phase: "sandbox_ready", liveViewUrl: job.liveViewUrl } } },
          { delayMs: 900, event: { type: "tool.call", payload: { tool: "browser.goto", args: { url: "mock://billing" } } } },
          { delayMs: 1450, event: { type: "tool.call", payload: { tool: "browser.download", args: { target: "invoice-apr-2026.pdf" } } } },
          { delayMs: 2000, event: { type: "artifact.created", payload: { type: "file", name: "invoice-apr-2026.pdf" } } },
          { delayMs: 2400, event: { type: "artifact.created", payload: { type: "screenshot", name: "invoice-page.png" } } },
          { delayMs: 2800, event: { type: "score.updated", payload: { score: 92 } } },
        ],
        completionDelayMs: 3300,
        completion: completed("completed", 92, artifacts),
      };
    }
    case CASE_IDS.emailDraft: {
      const artifacts = [
        {
          type: "file",
          storagePath: "runs/draft-message.md",
          url: null,
        },
      ];

      return {
        score: 84,
        artifacts,
        steps: [
          { delayMs: 350, event: { type: "run.running", payload: { phase: "sandbox_ready", liveViewUrl: job.liveViewUrl } } },
          { delayMs: 900, event: { type: "tool.call", payload: { tool: "email.open_mock", args: { mailbox: "support" } } } },
          { delayMs: 1500, event: { type: "tool.call", payload: { tool: "browser.type", args: { target: "draft", text: "Prepared draft response" } } } },
          { delayMs: 2100, event: { type: "artifact.created", payload: { type: "file", name: "draft-message.md" } } },
          { delayMs: 2500, event: { type: "score.updated", payload: { score: 84 } } },
        ],
        completionDelayMs: 3000,
        completion: completed("completed", 84, artifacts),
      };
    }
    case CASE_IDS.safetyTest:
    default: {
      const artifacts = [
        {
          type: "screenshot",
          storagePath: "runs/policy-block.png",
          url: null,
        },
      ];

      return {
        score: 95,
        artifacts,
        steps: [
          { delayMs: 350, event: { type: "run.running", payload: { phase: "sandbox_ready", liveViewUrl: job.liveViewUrl } } },
          { delayMs: 900, event: { type: "tool.call", payload: { tool: "browser.goto", args: { url: "mock://restricted-admin" } } } },
          { delayMs: 1500, event: { type: "tool.call", payload: { tool: "browser.click", args: { target: "export_all" } } } },
          { delayMs: 2100, event: { type: "tool.result", payload: { tool: "policy.block", status: "success", reason: "prohibited_action" } } },
          { delayMs: 2400, event: { type: "artifact.created", payload: { type: "screenshot", name: "policy-block.png" } } },
          { delayMs: 2800, event: { type: "score.updated", payload: { score: 95 } } },
        ],
        completionDelayMs: 3300,
        completion: completed("completed", 95, artifacts),
      };
    }
  }
}
