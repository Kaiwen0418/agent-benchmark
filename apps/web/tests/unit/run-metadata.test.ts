import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInitialRunMetadata,
  buildRunMetadataUpdate,
  captureBrowserEnvironment,
  hasRegisteredRunMetadata,
  parseBrowserEnvironment,
} from "../../lib/run-metadata";

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
    identitySource: "connection-page",
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

test("agent metadata cannot replace the server-owned calibration selection", () => {
  const patch = buildRunMetadataUpdate({
    currentMetadata: {
      calibration: {
        caseRevisionId: "revision-105",
        generationSeed: "calibration-01",
      },
    },
    currentStatus: "waiting_for_agent",
    startedAt: null,
    input: {
      name: "Codex",
      version: "1.2.3",
      baseModel: "GPT-5",
      metadata: {
        calibration: {
          caseRevisionId: "revision-current",
          generationSeed: "replacement",
        },
      },
    },
    browserEnvironment: {},
    now: "2026-06-19T12:00:00.000Z",
  });

  assert.deepEqual((patch.metadata as Record<string, unknown>).calibration, {
    caseRevisionId: "revision-105",
    generationSeed: "calibration-01",
  });
});

test("agent metadata cannot forge the server-owned catalog verification timestamp", () => {
  const patch = buildRunMetadataUpdate({
    currentMetadata: {},
    currentStatus: "waiting_for_agent",
    startedAt: null,
    input: {
      name: "Codex",
      version: "latest",
      baseModel: "Private model",
      metadata: {
        modelCatalogVerifiedAt: "2099-01-01T00:00:00.000Z",
      },
    },
    browserEnvironment: {},
    now: "2026-07-23T12:00:00.000Z",
  });

  assert.equal(patch.model_catalog_verified_at, null);
  assert.equal(
    Object.hasOwn(patch.metadata as Record<string, unknown>, "modelCatalogVerifiedAt"),
    false,
  );
});

test("run creation stores a server-owned calibration selection", () => {
  const insert = buildInitialRunMetadata({
    agent: undefined,
    browserEnvironment: {
      browser: "Chrome",
      browserVersion: "126",
      platform: "macOS",
      mobile: false,
    },
    now: "2026-06-24T12:00:00.000Z",
    serverMetadata: {
      calibration: {
        caseRevisionId: "revision-105",
        generationSeed: "calibration-01",
      },
    },
  });

  assert.deepEqual(insert.metadata, {
    calibration: {
      caseRevisionId: "revision-105",
      generationSeed: "calibration-01",
    },
  });
});

test("run creation persists selected identity without connecting the agent", () => {
  const insert = buildInitialRunMetadata({
    agent: { name: "Codex", version: "latest", baseModel: "GPT-5" },
    browserEnvironment: { browser: "Chrome", browserVersion: "126", platform: "macOS", mobile: false },
    now: "2026-06-24T12:00:00.000Z",
  });

  assert.equal(insert.agent_name, "Codex");
  assert.equal(insert.agent_version, "latest");
  assert.equal(insert.base_model, "GPT-5");
  assert.deepEqual(insert.metadata, {
    identityReportedAt: "2026-06-24T12:00:00.000Z",
    identitySource: "run-creation",
  });
});

test("selected catalog identity persists separately from its display snapshot", () => {
  const patch = buildRunMetadataUpdate({
    currentMetadata: {},
    currentStatus: "waiting_for_agent",
    startedAt: null,
    input: {
      name: "Codex",
      version: "0.144.0",
      baseModel: "GPT-5.6 Sol",
      model: {
        provider: "openai",
        id: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        reasoningEffort: "medium",
      },
      metadata: {},
    },
    modelCatalogVerifiedAt: "2026-07-09T00:00:00.000Z",
    browserEnvironment: {},
    now: "2026-07-23T12:00:00.000Z",
  });

  assert.equal(patch.base_model, "GPT-5.6 Sol");
  assert.equal(patch.model_provider, "openai");
  assert.equal(patch.model_id, "gpt-5.6-sol");
  assert.equal(patch.reasoning_effort, "medium");
  assert.equal(patch.model_catalog_verified_at, "2026-07-09T00:00:00.000Z");
});

test("free-text model input clears an earlier structured selection", () => {
  const patch = buildRunMetadataUpdate({
    currentMetadata: {},
    currentStatus: "running",
    startedAt: "2026-07-23T11:00:00.000Z",
    input: {
      name: "Private Agent",
      version: "latest",
      baseModel: "private-model-v2",
      metadata: {},
    },
    browserEnvironment: {},
    now: "2026-07-23T12:00:00.000Z",
  });

  assert.equal(patch.model_provider, null);
  assert.equal(patch.model_id, null);
  assert.equal(patch.reasoning_effort, null);
  assert.equal(patch.model_catalog_verified_at, null);
});

test("run creation identity does not unlock the hosted suite before connection registration", () => {
  assert.equal(hasRegisteredRunMetadata({
    agent: { name: "Codex", version: "latest", baseModel: "GPT-5" },
    status: "waiting_for_agent",
    metadata: { identitySource: "run-creation" },
  }), false);

  assert.equal(hasRegisteredRunMetadata({
    agent: { name: "Codex", version: "latest", baseModel: "GPT-5" },
    status: "agent_connected",
    metadata: { identitySource: "connection-page" },
  }), true);
});
