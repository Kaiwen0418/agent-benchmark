import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicWebOrigin } from "../../lib/public-origin";

test("configured public origin wins over a container request URL", () => {
  const previous = process.env.AUTH_URL;
  process.env.AUTH_URL = "https://web-test.example.com";
  try {
    assert.equal(
      resolvePublicWebOrigin(new Request("https://0.0.0.0:3000/api/runs/run/connect")),
      "https://web-test.example.com",
    );
  } finally {
    if (previous === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = previous;
  }
});

test("request origin is used when no public origin is configured", () => {
  const previousAuth = process.env.AUTH_URL;
  const previousPublic = process.env.AGENTBENCH_WEB_PUBLIC_URL;
  const previousWeb = process.env.AGENTBENCH_WEB_URL;
  delete process.env.AUTH_URL;
  delete process.env.AGENTBENCH_WEB_PUBLIC_URL;
  delete process.env.AGENTBENCH_WEB_URL;
  try {
    assert.equal(
      resolvePublicWebOrigin(new Request("http://127.0.0.1:3000/api/runs/run/connect")),
      "http://127.0.0.1:3000",
    );
  } finally {
    if (previousAuth !== undefined) process.env.AUTH_URL = previousAuth;
    if (previousPublic !== undefined) process.env.AGENTBENCH_WEB_PUBLIC_URL = previousPublic;
    if (previousWeb !== undefined) process.env.AGENTBENCH_WEB_URL = previousWeb;
  }
});
