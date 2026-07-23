import assert from "node:assert/strict";
import test from "node:test";
import type { BenchmarkRun } from "@agentbench/protocol";
import {
  isCalibrationControlsEnabled,
  readCalibrationRunSelection,
} from "../../lib/calibration";

test("enables calibration for local, preview, and develop deployments", () => {
  assert.equal(isCalibrationControlsEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isCalibrationControlsEnabled({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/test",
  }), true);
  assert.equal(isCalibrationControlsEnabled({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "develop",
  }), true);
});

test("keeps calibration disabled after develop is promoted to main", () => {
  assert.equal(isCalibrationControlsEnabled({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
  }), false);
});

test("reads only complete server-owned calibration metadata", () => {
  assert.deepEqual(readCalibrationRunSelection({
    metadata: {
      calibration: {
        caseRevisionId: "revision-105",
        generationSeed: "calibration-01",
      },
    },
  } as BenchmarkRun), {
    caseRevisionId: "revision-105",
    generationSeed: "calibration-01",
  });

  assert.equal(readCalibrationRunSelection({
    metadata: { calibration: { caseRevisionId: "revision-105" } },
  } as BenchmarkRun), null);
});
