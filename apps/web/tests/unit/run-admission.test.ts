import assert from "node:assert/strict";
import test from "node:test";
import { getRunCreationMode, isRunCreationAllowed } from "../../lib/run-admission";

test("run creation is open by default", () => {
  assert.equal(getRunCreationMode(undefined), "open");
  assert.equal(getRunCreationMode("open"), "open");
  assert.equal(isRunCreationAllowed("open"), true);
});

test("the cutover freeze rejects new runs", () => {
  assert.equal(getRunCreationMode("frozen"), "frozen");
  assert.equal(isRunCreationAllowed("frozen"), false);
});

test("invalid operational values fail closed", () => {
  assert.equal(getRunCreationMode("typo"), "frozen");
  assert.equal(isRunCreationAllowed("typo"), false);
});

test("the run API rejects a frozen request before parsing its body", async () => {
  const previousMode = process.env.RUN_CREATION_MODE;
  process.env.RUN_CREATION_MODE = "frozen";

  try {
    const { POST } = await import("../../app/api/runs/route");
    const response = await POST(new Request("http://localhost/api/runs", {
      method: "POST",
      body: "not-json",
    }));

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("retry-after"), "300");
    assert.deepEqual(await response.json(), {
      error: "run_creation_frozen",
      message: "New benchmark runs are temporarily paused for database maintenance.",
      retryable: true,
    });
  } finally {
    if (previousMode === undefined) delete process.env.RUN_CREATION_MODE;
    else process.env.RUN_CREATION_MODE = previousMode;
  }
});
