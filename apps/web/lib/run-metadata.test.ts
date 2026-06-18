import assert from "node:assert/strict";
import test from "node:test";
import { captureBrowserEnvironment, parseBrowserEnvironment } from "./run-metadata";

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
