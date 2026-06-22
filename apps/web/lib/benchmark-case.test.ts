import assert from "node:assert/strict";
import test from "node:test";
import type { BenchmarkCase } from "@agentbench/protocol";
import { isRunnableBenchmarkCase } from "./db";

const runnableCase: BenchmarkCase = {
  id: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0005",
  slug: "hosted-web-suite",
  title: "Hosted Web Suite",
  description: "Hosted benchmark suite",
  category: "browser",
  difficulty: "easy",
  provider: "hosted-web",
  currentRevisionId: "7e8a6df3-17c3-4ddb-9877-d0bd8a0f0105",
  metadata: {},
  isPublic: true,
  createdAt: new Date(0).toISOString(),
};

test("only a public hosted case with a published revision is runnable", () => {
  assert.equal(isRunnableBenchmarkCase(runnableCase), true);
  assert.equal(isRunnableBenchmarkCase({ ...runnableCase, isPublic: false }), false);
  assert.equal(isRunnableBenchmarkCase({ ...runnableCase, provider: "native" }), false);
  assert.equal(isRunnableBenchmarkCase({ ...runnableCase, currentRevisionId: null }), false);
  assert.equal(isRunnableBenchmarkCase(null), false);
});
