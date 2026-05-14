import type { Page } from "playwright";
import {
  agentbenchToolCallSchema,
  browserClickArgsSchema,
  browserDownloadArgsSchema,
  browserExtractTextArgsSchema,
  browserGotoArgsSchema,
  browserScreenshotArgsSchema,
  browserTypeArgsSchema,
} from "@agentbench/mcp-tools";

export async function browserGoto(page: Page, args: unknown) {
  const input = browserGotoArgsSchema.parse(args);
  await page.goto(input.url, { waitUntil: "domcontentloaded" });
}

export async function browserClick(page: Page, args: unknown) {
  const input = browserClickArgsSchema.parse(args);
  await page.locator(input.selector).click();
}

export async function browserType(page: Page, args: unknown) {
  const input = browserTypeArgsSchema.parse(args);
  await page.locator(input.selector).fill(input.text);
}

export async function browserExtractText(page: Page, args: unknown) {
  const input = browserExtractTextArgsSchema.parse(args);
  return page.locator(input.selector).innerText();
}

export async function browserScreenshot(page: Page, args: unknown) {
  const input = browserScreenshotArgsSchema.parse(args);
  await page.screenshot({
    path: input.path,
    fullPage: input.fullPage,
  });
}

export function parseBrowserDownloadArgs(args: unknown) {
  return browserDownloadArgsSchema.parse(args);
}

export function validateBrowserToolCall(input: unknown) {
  return agentbenchToolCallSchema.parse(input);
}
