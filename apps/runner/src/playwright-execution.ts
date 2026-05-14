import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Download, type Page } from "playwright";
import type { AppendRunEventInput, CompleteRunInput } from "@agentbench/protocol";
import { runnerConfig } from "./config.js";
import {
  browserClick,
  browserExtractText,
  browserGoto,
  parseBrowserDownloadArgs,
  browserScreenshot,
  browserType,
  validateBrowserToolCall,
} from "./browser-actions.js";
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
  page: Page;
  context: BrowserContext;
  emit: (event: AppendRunEventInput) => Promise<void>;
  callTool: <T>(tool: string, args: Record<string, unknown>, action: () => Promise<T>) => Promise<T>;
  writeLocalFile: (name: string, contents: string | Uint8Array) => Promise<ArtifactRecord>;
  saveScreenshot: (name: string) => Promise<ArtifactRecord>;
};

type ScenarioResult = {
  score: number;
  artifacts: ArtifactRecord[];
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

async function ensureRunDir(runId: string) {
  const dir = artifactDirForRun(runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

function formatPlaywrightError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function withToolEvent<T>(
  emit: (event: AppendRunEventInput) => Promise<void>,
  tool: string,
  args: Record<string, unknown>,
  action: () => Promise<T>,
) {
  if (tool.startsWith("browser.")) {
    validateBrowserToolCall({ tool, args });
  }
  const startedAt = nowMs();
  await emit({
    type: "tool.call",
    payload: {
      tool,
      args,
    },
  });

  try {
    const result = await action();
    await emit({
      type: "tool.result",
      payload: {
        tool,
        status: "success",
        duration: `${nowMs() - startedAt}ms`,
      },
    });
    return result;
  } catch (error) {
    await emit({
      type: "tool.result",
      payload: {
        tool,
        status: "error",
        duration: `${nowMs() - startedAt}ms`,
        reason: formatPlaywrightError(error),
      },
    });
    throw error;
  }
}

async function runWebSearchScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/web-search`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await browserGoto(ctx.page, { url });
  });
  await ctx.callTool("browser.type", { selector: "#query", text: "latest agent benchmarks" }, async () => {
    await browserType(ctx.page, { selector: "#query", text: "latest agent benchmarks" });
  });
  await ctx.callTool("browser.click", { selector: "#search" }, async () => {
    await browserClick(ctx.page, { selector: "#search" });
    await ctx.page.locator("#results").waitFor({ state: "visible" });
  });

  const summary = await ctx.callTool("browser.extract_text", { selector: "[data-result='summary']" }, async () => {
    return browserExtractText(ctx.page, { selector: "[data-result='summary']" });
  });

  const fileArtifact = await ctx.callTool("file.write", { path: "search-summary.txt" }, async () => {
    return ctx.writeLocalFile("search-summary.txt", `${summary}\n`);
  });

  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "search-results.png", fullPage: true }, async () => {
    return ctx.saveScreenshot("search-results.png");
  });

  return {
    score: 87,
    artifacts: [fileArtifact, screenshotArtifact],
  };
}

async function saveDownload(download: Download, runId: string, fileName: string) {
  const dir = await ensureRunDir(runId);
  const absolutePath = path.join(dir, fileName);
  await download.saveAs(absolutePath);
  return {
    type: "file" as const,
    name: fileName,
    relativePath: toRelativeArtifactPath(runId, fileName),
  };
}

async function runInvoiceDownloadScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/invoice-download`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await browserGoto(ctx.page, { url });
  });
  const download = await ctx.callTool("browser.download", { selector: "#download" }, async () => {
    const { selector } = parseBrowserDownloadArgs({ selector: "#download" });
    const [result] = await Promise.all([
      ctx.page.waitForEvent("download"),
      ctx.page.locator(selector).click(),
    ]);
    return result;
  });

  const fileArtifact = await saveDownload(download, ctx.runId, "invoice-apr-2026.pdf");
  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "invoice-page.png" }, async () => {
    return ctx.saveScreenshot("invoice-page.png");
  });

  return {
    score: 92,
    artifacts: [fileArtifact, screenshotArtifact],
  };
}

async function runEmailDraftScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/email-draft`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await browserGoto(ctx.page, { url });
  });
  await ctx.callTool("email.open_mock", { mailbox: "support" }, async () => {
    await ctx.page.locator("#message").click();
  });
  await ctx.callTool("browser.type", { selector: "#draft", text: "draft response" }, async () => {
    await browserType(ctx.page, {
      selector: "#draft",
      text:
      "Hi Atlas Studio,\n\nWe reviewed your request and prepared the refund details for processing.\n\nBest,\nAgentBench Support",
    });
  });
  await ctx.callTool("email.save_draft", { target: "#save" }, async () => {
    await ctx.page.locator("#save").click();
    await ctx.page.getByText("Draft saved").waitFor();
  });

  const body = await ctx.page.locator("#draft").inputValue();
  const fileArtifact = await ctx.callTool("file.write", { path: "draft-message.md" }, async () => {
    return ctx.writeLocalFile("draft-message.md", body);
  });
  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "draft-message.png" }, async () => {
    return ctx.saveScreenshot("draft-message.png");
  });

  return {
    score: 84,
    artifacts: [fileArtifact, screenshotArtifact],
  };
}

async function runSafetyScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const url = `${runnerConfig.mockSitesUrl}/safety-test`;
  await ctx.callTool("browser.goto", { url }, async () => {
    await browserGoto(ctx.page, { url });
  });
  await ctx.callTool("browser.click", { selector: "#export" }, async () => {
    await browserClick(ctx.page, { selector: "#export" });
  });

  const reason = await ctx.page.locator("#banner").innerText();
  await ctx.emit({
    type: "tool.result",
    payload: {
      tool: "policy.block",
      status: "warning",
      reason,
      duration: "0ms",
    },
  });

  const screenshotArtifact = await ctx.callTool("browser.screenshot", { path: "policy-block.png" }, async () => {
    return ctx.saveScreenshot("policy-block.png");
  });

  return {
    score: 95,
    artifacts: [screenshotArtifact],
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
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: runnerConfig.headless,
    });

    context = await browser.newContext({
      acceptDownloads: true,
      viewport: {
        width: 1280,
        height: 820,
      },
    });

    const page = await context.newPage();
    const ctx: ScenarioContext = {
      runId: job.runId,
      page,
      context,
      emit: emitAndTrack,
      callTool: (tool, args, action) => withToolEvent(emitAndTrack, tool, args, action),
      writeLocalFile: async (name, contents) => {
        const dir = await ensureRunDir(job.runId);
        const absolutePath = path.join(dir, name);
        await writeFile(absolutePath, contents);
        return {
          type: "file",
          name,
          relativePath: toRelativeArtifactPath(job.runId, name),
        };
      },
      saveScreenshot: async (name) => {
        const dir = await ensureRunDir(job.runId);
        const absolutePath = path.join(dir, name);
        await page.screenshot({ path: absolutePath, fullPage: true });
        return {
          type: "screenshot",
          name,
          relativePath: toRelativeArtifactPath(job.runId, name),
        };
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
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}
