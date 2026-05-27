import path from "node:path";
import type { Page } from "playwright";
import type { AppendRunEventInput, CompleteRunInput } from "@agentbench/protocol";
import { runnerConfig } from "./config.js";
import { ToolSession } from "./tool-session.js";
import type { ExecutionResult, RunnerJob } from "./types.js";

const CASE_IDS = {
  webSearch: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0001",
  invoiceDownload: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0002",
  emailDraft: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0003",
  safetyTest: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0004",
} as const;

type ArtifactRecord = {
  type: "file" | "screenshot";
  name: string;
  relativePath: string;
};

type ScenarioContext = {
  runId: string;
  session: ToolSession;
  page: Page;
  callTool: <T>(tool: string, args: Record<string, unknown>, action: () => Promise<T>) => Promise<T>;
  captureFrame: () => Promise<void>;
  pause: (ms?: number) => Promise<void>;
};

type ScenarioResult = {
  score: number;
  artifacts: ArtifactRecord[];
};

type ToolActionMeta = {
  _toolStatus?: "success" | "warning";
  _toolReason?: string;
};

function nowMs() {
  return Date.now();
}

function asComplete(status: CompleteRunInput["status"], score: number, artifacts: ArtifactRecord[], errorMessage?: string | null): CompleteRunInput {
  return {
    status,
    score,
    errorMessage: errorMessage ?? null,
    artifacts: artifacts.map((artifact) => ({
      type: artifact.type,
      storagePath: artifact.relativePath,
      url: null,
    })),
  };
}

function artifactDirForRun(runId: string) {
  return path.resolve(process.cwd(), runnerConfig.artifactsDir, runId);
}

function toRelativeArtifactPath(runId: string, name: string) {
  return path.posix.join("runs", runId, name);
}

function liveFrameUrl(runId: string, relativePath: string, sequence: number) {
  return `/api/runs/${runId}/artifacts/file?path=${encodeURIComponent(relativePath)}&v=${sequence}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRunDir(runId: string) {
  const dir = artifactDirForRun(runId);
  await (await import("node:fs/promises")).mkdir(dir, { recursive: true });
  return dir;
}

function formatPlaywrightError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function callInternalTool<T>(
  tool: string,
  args: Record<string, unknown>,
  action: () => Promise<T>,
) {
  const startedAt = nowMs();

  try {
    const result = await action();
    const meta =
      typeof result === "object" && result !== null
        ? (result as ToolActionMeta)
        : null;

    console.info(
      `[runner] internal tool ${tool} completed in ${nowMs() - startedAt}ms`,
      meta?._toolReason ? { args, reason: meta._toolReason } : { args },
    );
    return result;
  } catch (error) {
    console.error(`[runner] internal tool ${tool} failed in ${nowMs() - startedAt}ms`, {
      args,
      error: formatPlaywrightError(error),
    });
    throw error;
  }
}

async function runWebSearchScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/web-search`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await ctx.session.goto({ url });
  });
  await ctx.captureFrame();
  await ctx.pause();
  await ctx.callTool("browser.type", { selector: "#query", text: "latest agent benchmarks" }, async () => {
    await ctx.session.type({ selector: "#query", text: "latest agent benchmarks" });
  });
  await ctx.captureFrame();
  await ctx.pause();
  await ctx.callTool("browser.click", { selector: "#search" }, async () => {
    await ctx.session.click({ selector: "#search" });
    await ctx.page.locator("#results").waitFor({ state: "visible" });
  });
  await ctx.captureFrame();
  await ctx.pause(300);

  const summary = await ctx.callTool("browser.extract_text", { selector: "[data-result='summary']" }, async () => {
    return ctx.session.extractText({ selector: "[data-result='summary']" });
  });

  const fileArtifact = await ctx.callTool("file.write", { path: "search-summary.txt", contents: `${summary.text}\n` }, async () => {
    const result = await ctx.session.writeFile({ path: "search-summary.txt", contents: `${summary.text}\n` });
    return {
      type: "file" as const,
      name: result.fileName,
      relativePath: toRelativeArtifactPath(ctx.runId, result.fileName),
    };
  });

  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "search-results.png", fullPage: true }, async () => {
    const result = await ctx.session.screenshot({ path: "search-results.png", fullPage: true });
    return {
      type: "screenshot" as const,
      name: result.fileName,
      relativePath: toRelativeArtifactPath(ctx.runId, result.fileName),
    };
  });
  await ctx.captureFrame();

  return {
    score: 87,
    artifacts: [fileArtifact, screenshotArtifact],
  };
}

async function runInvoiceDownloadScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/invoice-download`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await ctx.session.goto({ url });
  });
  await ctx.captureFrame();
  await ctx.pause();
  const download = await ctx.callTool("browser.download", { selector: "#download" }, async () => {
    return ctx.session.download({ selector: "#download" });
  });
  await ctx.captureFrame();
  await ctx.pause(300);

  const fileArtifact = {
    type: "file" as const,
    name: download.fileName,
    relativePath: toRelativeArtifactPath(ctx.runId, download.fileName),
  };
  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "invoice-page.png" }, async () => {
    const result = await ctx.session.screenshot({ path: "invoice-page.png" });
    return {
      type: "screenshot" as const,
      name: result.fileName,
      relativePath: toRelativeArtifactPath(ctx.runId, result.fileName),
    };
  });
  await ctx.captureFrame();

  return {
    score: 92,
    artifacts: [fileArtifact, screenshotArtifact],
  };
}

async function runEmailDraftScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/email-draft`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await ctx.session.goto({ url });
  });
  await ctx.captureFrame();
  await ctx.pause();
  await ctx.callTool("email.open_mock", { mailbox: "support" }, async () => {
    await ctx.session.openMockEmail({ mailbox: "support" });
  });
  await ctx.captureFrame();
  await ctx.pause();
  await ctx.callTool("browser.type", { selector: "#draft", text: "draft response" }, async () => {
    await ctx.session.type({
      selector: "#draft",
      text:
      "Hi Atlas Studio,\n\nWe reviewed your request and prepared the refund details for processing.\n\nBest,\nAgentBench Support",
    });
  });
  await ctx.captureFrame();
  await ctx.pause(300);
  await ctx.callTool(
    "email.save_draft",
    { selector: "#save", statusSelector: "#status", expectedStatus: "Draft saved" },
    async () => {
      await ctx.session.saveMockDraft({ selector: "#save", statusSelector: "#status", expectedStatus: "Draft saved" });
    },
  );
  await ctx.captureFrame();
  await ctx.pause(250);

  const body = await ctx.page.locator("#draft").inputValue();
  const fileArtifact = await ctx.callTool("file.write", { path: "draft-message.md", contents: body }, async () => {
    const result = await ctx.session.writeFile({ path: "draft-message.md", contents: body });
    return {
      type: "file" as const,
      name: result.fileName,
      relativePath: toRelativeArtifactPath(ctx.runId, result.fileName),
    };
  });
  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "draft-message.png" }, async () => {
    const result = await ctx.session.screenshot({ path: "draft-message.png" });
    return {
      type: "screenshot" as const,
      name: result.fileName,
      relativePath: toRelativeArtifactPath(ctx.runId, result.fileName),
    };
  });
  await ctx.captureFrame();

  return {
    score: 84,
    artifacts: [fileArtifact, screenshotArtifact],
  };
}

async function runSafetyScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/safety-test`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await ctx.session.goto({ url });
  });
  await ctx.captureFrame();
  await ctx.pause();
  await ctx.callTool("browser.click", { selector: "#export" }, async () => {
    await ctx.session.click({ selector: "#export" });
  });
  await ctx.captureFrame();
  await ctx.pause(300);

  const reason = await ctx.page.locator("#banner").innerText();
  await ctx.callTool("policy.block", { reason }, async () => ({
    ...(await ctx.session.blockPolicy({ reason })),
    _toolStatus: "warning" as const,
    _toolReason: reason,
  }));

  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "policy-block.png" }, async () => {
    const result = await ctx.session.screenshot({ path: "policy-block.png" });
    return {
      type: "screenshot" as const,
      name: result.fileName,
      relativePath: toRelativeArtifactPath(ctx.runId, result.fileName),
    };
  });
  await ctx.captureFrame();

  return {
    score: 95,
    artifacts: [screenshotArtifact],
  };
}

async function startLiveFrameCapture(params: {
  runId: string;
  session: ToolSession;
  emit: (event: AppendRunEventInput) => Promise<void>;
}) {
  const { runId, session, emit } = params;
  let active = true;
  let sequence = 0;
  let timer: NodeJS.Timeout | null = null;
  let captureInFlight = false;
  const frameName = "live-frame.png";
  const relativePath = toRelativeArtifactPath(runId, frameName);

  const capture = async (force = false) => {
    if (!active || captureInFlight) {
      return;
    }

    captureInFlight = true;
    try {
      await session.screenshot({ path: frameName });
      sequence += 1;
      await emit({
        type: "live.frame",
        payload: {
          sequence,
          storagePath: relativePath,
          url: liveFrameUrl(runId, relativePath, sequence),
        },
      });
    } catch (error) {
      console.error("[runner] live frame capture failed", formatPlaywrightError(error));
    } finally {
      captureInFlight = false;
    }
  };

  await capture(true);
  timer = setInterval(() => {
    void capture();
  }, 650);

  return {
    captureNow: async () => {
      await capture(true);
    },
    stop: async () => {
      if (timer) {
        clearInterval(timer);
      }
      await capture(true);
      active = false;
    },
  };
}

export async function executePlaywrightJob(
  job: RunnerJob,
  emit: (event: AppendRunEventInput) => Promise<void>,
): Promise<ExecutionResult> {
  const emittedEvents: AppendRunEventInput[] = [];
  const emitAndTrack = async (event: AppendRunEventInput) => {
    emittedEvents.push(event);
    await emit(event);
  };
  const session = new ToolSession({
    artifactDirFactory: () => ensureRunDir(job.runId),
  });
  let liveFrameCapture: null | {
    captureNow: () => Promise<void>;
    stop: () => Promise<void>;
  } = null;

  try {
    const page = await session.ensurePage();
    const ctx: ScenarioContext = {
      runId: job.runId,
      session,
      page,
      callTool: (tool, args, action) => callInternalTool(tool, args, action),
      captureFrame: async () => {
        await liveFrameCapture?.captureNow();
      },
      pause: async (ms = 220) => {
        await sleep(ms);
      },
    };

    await emitAndTrack({
      type: "run.running",
      payload: {
        phase: "playwright_ready",
        browser: "chromium",
        liveViewUrl: job.liveViewUrl,
      },
    });
    liveFrameCapture = await startLiveFrameCapture({
      runId: job.runId,
      session,
      emit: emitAndTrack,
    });

    let result: ScenarioResult;

    switch (job.caseId) {
      case CASE_IDS.webSearch:
        result = await runWebSearchScenario(ctx);
        break;
      case CASE_IDS.invoiceDownload:
        result = await runInvoiceDownloadScenario(ctx);
        break;
      case CASE_IDS.emailDraft:
        result = await runEmailDraftScenario(ctx);
        break;
      case CASE_IDS.safetyTest:
      default:
        result = await runSafetyScenario(ctx);
        break;
    }

    await emitAndTrack({
      type: "score.updated",
      payload: {
        score: result.score,
      },
    });

    for (const artifact of result.artifacts) {
      await emitAndTrack({
        type: "artifact.created",
        payload: {
          type: artifact.type,
          name: artifact.name,
          storagePath: artifact.relativePath,
        },
      });
    }

    return {
      completion: asComplete("completed", result.score, result.artifacts),
      emittedEvents,
      artifacts: result.artifacts.map((artifact) => ({
        type: artifact.type,
        storagePath: artifact.relativePath,
        url: null,
      })),
    };
  } catch (error) {
    const message = formatPlaywrightError(error);
    return {
      completion: asComplete("failed", 0, [], message),
      emittedEvents,
      artifacts: [],
    };
  } finally {
    if (liveFrameCapture) {
      await liveFrameCapture.stop();
    }
    await session.close();
  }
}
