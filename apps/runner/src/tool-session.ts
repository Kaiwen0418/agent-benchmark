import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Download, type Page } from "playwright";
import {
  emailOpenMockArgsSchema,
  emailSaveDraftArgsSchema,
  fileWriteArgsSchema,
  policyBlockArgsSchema,
} from "@agentbench/mcp-tools";
import { runnerConfig } from "./config.js";
import {
  browserClick,
  browserExtractText,
  browserGoto,
  parseBrowserDownloadArgs,
  browserScreenshot,
  browserType,
} from "./browser-actions.js";

function sanitizeFileName(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

type ToolSessionOptions = {
  artifactDirFactory?: () => Promise<string>;
};

type RecordedArtifact = {
  type: "file" | "screenshot";
  storagePath: string | null;
  url: string | null;
};

export class ToolSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private artifactDirPromise: Promise<string> | null = null;
  private recordedArtifacts: RecordedArtifact[] = [];

  constructor(private readonly options: ToolSessionOptions = {}) {}

  private async ensureArtifactDir() {
    if (!this.options.artifactDirFactory) {
      throw new Error("Artifact directory is not configured for this tool session.");
    }

    if (!this.artifactDirPromise) {
      this.artifactDirPromise = this.options.artifactDirFactory();
    }

    return this.artifactDirPromise;
  }

  async ensurePage() {
    if (this.page) {
      return this.page;
    }

    this.browser = await chromium.launch({
      headless: runnerConfig.headless,
    });

    this.context = await this.browser.newContext({
      acceptDownloads: true,
      viewport: {
        width: 1280,
        height: 820,
      },
    });

    this.page = await this.context.newPage();
    return this.page;
  }

  async goto(args: unknown) {
    const page = await this.ensurePage();
    await browserGoto(page, args);
    return {
      url: page.url(),
      title: await page.title(),
    };
  }

  async click(args: unknown) {
    const page = await this.ensurePage();
    await browserClick(page, args);
    return {
      url: page.url(),
    };
  }

  async type(args: unknown) {
    const page = await this.ensurePage();
    await browserType(page, args);
    return {
      url: page.url(),
    };
  }

  async extractText(args: unknown) {
    const page = await this.ensurePage();
    const text = await browserExtractText(page, args);
    return {
      text,
      url: page.url(),
    };
  }

  async screenshot(args: unknown) {
    const page = await this.ensurePage();
    const dir = await this.ensureArtifactDir();
    const fileName =
      typeof args === "object" && args && "path" in args && typeof args.path === "string"
        ? sanitizeFileName(args.path)
        : `screenshot-${Date.now()}.png`;
    const absolutePath = path.join(dir, fileName);
    await browserScreenshot(page, {
      ...(typeof args === "object" && args ? args : {}),
      path: absolutePath,
    });
    this.recordedArtifacts.push({
      type: "screenshot",
      storagePath: null,
      url: null,
    });
    return {
      path: absolutePath,
      fileName,
      url: page.url(),
    };
  }

  async download(args: unknown) {
    const page = await this.ensurePage();
    const { selector } = parseBrowserDownloadArgs(args);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(selector).click(),
    ]);
    return this.saveDownload(download);
  }

  async writeFile(args: unknown) {
    const dir = await this.ensureArtifactDir();
    const input = fileWriteArgsSchema.parse(args);
    const fileName = sanitizeFileName(input.path);
    const absolutePath = path.join(dir, fileName);
    await writeFile(absolutePath, input.contents, "utf8");
    this.recordedArtifacts.push({
      type: "file",
      storagePath: null,
      url: null,
    });
    return {
      path: absolutePath,
      fileName,
    };
  }

  async openMockEmail(args: unknown) {
    const page = await this.ensurePage();
    const input = emailOpenMockArgsSchema.parse(args);
    await page.locator(input.selector).click();
    return {
      mailbox: input.mailbox,
      selector: input.selector,
      url: page.url(),
    };
  }

  async saveMockDraft(args: unknown) {
    const page = await this.ensurePage();
    const input = emailSaveDraftArgsSchema.parse(args);
    await page.locator(input.selector).click();
    await page.locator(input.statusSelector).filter({ hasText: input.expectedStatus }).waitFor();
    return {
      selector: input.selector,
      statusSelector: input.statusSelector,
      expectedStatus: input.expectedStatus,
      url: page.url(),
    };
  }

  async blockPolicy(args: unknown) {
    const input = policyBlockArgsSchema.parse(args);
    return {
      reason: input.reason,
      blocked: true,
      url: this.page?.url() ?? null,
    };
  }

  async close() {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  getRecordedArtifacts() {
    return [...this.recordedArtifacts];
  }

  private async saveDownload(download: Download) {
    const dir = await this.ensureArtifactDir();
    const suggestedName = download.suggestedFilename();
    const fileName = sanitizeFileName(suggestedName || `download-${Date.now()}`);
    const absolutePath = path.join(dir, fileName);
    await download.saveAs(absolutePath);
    this.recordedArtifacts.push({
      type: "file",
      storagePath: null,
      url: null,
    });
    return {
      path: absolutePath,
      fileName,
      url: this.page?.url() ?? null,
    };
  }
}

export async function createMcpArtifactDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), runnerConfig.artifactsDir, "mcp", stamp);
  await mkdir(dir, { recursive: true });
  return dir;
}
