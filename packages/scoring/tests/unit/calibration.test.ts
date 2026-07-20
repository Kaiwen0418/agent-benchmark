import assert from "node:assert/strict";
import test from "node:test";
import { buildCalibrationReport } from "../../src/index.js";

function observations(params: {
  revision: string;
  status: "passed" | "failed";
  score: number;
}) {
  return ["agent-a", "agent-b", "agent-c"].flatMap((agentFamily) =>
    Array.from({ length: 20 }, (_, index) => ({
      benchmarkRevision: params.revision,
      agentFamily,
      seed: `seed-${index}`,
      status: params.status,
      completionMs: params.status === "passed" ? 1_000 : 1_500,
      normalizedActionCost: params.status === "passed" ? 20 : 30,
      tracks: [
        { id: "aggregate", status: params.status, score: params.score },
        { id: "recovery", status: params.status, score: params.score },
      ],
    })),
  );
}

test("calibration report emits repeated-seed confidence intervals and a strict difficulty comparison", () => {
  const report = buildCalibrationReport({
    baselineRevision: "hard-v1.0.5",
    candidateRevision: "capability-draft",
    observations: [
      ...observations({ revision: "hard-v1.0.5", status: "passed", score: 1 }),
      ...observations({ revision: "capability-draft", status: "failed", score: 0 }),
    ],
  });

  assert.equal(report.readiness.ready, true);
  assert.deepEqual(report.readiness.commonAgentFamilies, ["agent-a", "agent-b", "agent-c"]);
  assert.equal(report.baseline.runCount, 60);
  assert.equal(report.candidate.runCount, 60);
  assert.equal(report.baseline.passRate.confidence, 0.95);
  assert.ok(report.baseline.passRate.lower > report.candidate.passRate.upper);
  assert.equal(report.difficultyComparison.measurablyHarder, true);
  assert.equal(report.difficultyComparison.passRateDifference, -1);
  assert.deepEqual(report.candidate.tracks.map((track) => track.id), ["aggregate", "recovery"]);
});

test("calibration report stays unready without three shared families and repeated seeds", () => {
  const report = buildCalibrationReport({
    baselineRevision: "baseline",
    candidateRevision: "candidate",
    observations: [
      {
        benchmarkRevision: "baseline",
        agentFamily: "only-agent",
        seed: "one",
        status: "passed",
        completionMs: 100,
        normalizedActionCost: 5,
        tracks: [{ id: "aggregate", status: "passed", score: 1 }],
      },
      {
        benchmarkRevision: "candidate",
        agentFamily: "only-agent",
        seed: "one",
        status: "failed",
        completionMs: 200,
        normalizedActionCost: 10,
        tracks: [{ id: "aggregate", status: "failed", score: 0 }],
      },
    ],
  });

  assert.equal(report.readiness.ready, false);
  assert.equal(report.difficultyComparison.measurablyHarder, false);
  assert.match(report.readiness.reasons.join(" "), /three|3|repeated seeds/i);
});

test("calibration report rejects duplicate revision-family-seed observations", () => {
  const observation = {
    benchmarkRevision: "baseline",
    agentFamily: "agent-a",
    seed: "same",
    status: "passed" as const,
    completionMs: 100,
    normalizedActionCost: 5,
    tracks: [{ id: "aggregate", status: "passed" as const, score: 1 }],
  };
  assert.throws(() => buildCalibrationReport({
    baselineRevision: "baseline",
    candidateRevision: "candidate",
    observations: [
      observation,
      observation,
      { ...observation, benchmarkRevision: "candidate", status: "failed", tracks: [{ id: "aggregate", status: "failed", score: 0 }] },
    ],
  }), /unique revision\/family\/seed/);
});
