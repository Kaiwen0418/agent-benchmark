import assert from "node:assert/strict";
import test from "node:test";
import { buildRunMetadataUpdate, captureBrowserEnvironment, parseBrowserEnvironment } from "../../lib/run-metadata";

test("captures Chromium browser metadata without exposing it to leaderboard callers", () => {
  const environment = captureBrowserEnvironment(new Headers({
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    "sec-ch-ua-platform": '"Linux"',
    "sec-ch-ua-mobile": "?0",
  }));

  assert.deepEqual(environment, {
    browser: "Chrome",
    browserVersion: "126.0.0.0",
    platform: "Linux",
    mobile: false,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
  });
});

test("captures mobile Safari metadata", () => {
  const environment = captureBrowserEnvironment(new Headers({
    "user-agent": "Mozilla/5.0 (iPhone) Version/17.5 Mobile/15E148 Safari/604.1",
  }));

  assert.equal(environment.browser, "Safari");
  assert.equal(environment.browserVersion, "17.5");
  assert.equal(environment.platform, "iOS");
  assert.equal(environment.mobile, true);
});

test("parses a browser observed by the hosted session", () => {
  const environment = parseBrowserEnvironment(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0.0.0 Safari/537.36",
  );

  assert.equal(environment.browser, "Chrome");
  assert.equal(environment.platform, "macOS");
});

test("first agent registration starts and connects a waiting run", () => {
  const patch = buildRunMetadataUpdate({
    currentMetadata: { source: "existing" },
    currentStatus: "waiting_for_agent",
    startedAt: null,
    input: { name: "Codex", version: "1.2.3", baseModel: "GPT-5", metadata: { source: "agent" } },
    browserEnvironment: { browser: "Chrome" },
    now: "2026-06-19T12:00:00.000Z",
  });

  assert.equal(patch.started_at, "2026-06-19T12:00:00.000Z");
  assert.equal(patch.status, "agent_connected");
  assert.deepEqual(patch.metadata, {
    source: "agent",
    identityReportedAt: "2026-06-19T12:00:00.000Z",
  });
});

test("repeated registration preserves the original start time", () => {
  const patch = buildRunMetadataUpdate({
    currentMetadata: {},
    currentStatus: "running",
    startedAt: "2026-06-19T11:59:00.000Z",
    input: { name: "Codex", version: "1.2.4", baseModel: "GPT-5", metadata: {} },
    browserEnvironment: {},
    now: "2026-06-19T12:00:00.000Z",
  });

  assert.equal(patch.started_at, "2026-06-19T11:59:00.000Z");
  assert.equal(patch.status, "running");
});
