import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");

test("hosted app scaffold creates colocated runtime and testcase definitions", async () => {
  const targetRoot = await mkdtemp(path.join(tmpdir(), "agentbench-hosted-app-"));
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts/create-hosted-app.mjs"), "calendar-lite", "--skip-generate"],
    {
      env: { ...process.env, HOSTED_APP_ROOT: targetRoot },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const hostedDir = path.join(targetRoot, "apps/hosted-sites/src/apps/calendar-lite");
  const testcaseDefinition = path.join(targetRoot, "packages/test-cases/src/apps/calendar-lite/definition.ts");
  for (const file of [
    "actions.ts",
    "definition.ts",
    "evaluate.ts",
    "final-state.ts",
    "render.ts",
    "routes.ts",
    "seed.ts",
    "test-driver.mjs",
    "test-support.ts",
    "types.ts",
  ]) {
    assert.equal(existsSync(path.join(hostedDir, file)), true, file);
  }
  assert.match(readFileSync(testcaseDefinition, "utf8"), /calendarLiteTestcaseDefinition/);
  assert.match(result.stdout, /add its session explicitly/);
});
