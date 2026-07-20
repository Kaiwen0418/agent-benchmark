import { z } from "zod";

const calibrationStatusSchema = z.enum(["passed", "failed", "error"]);

export const calibrationTrackObservationSchema = z.object({
  id: z.string().min(1),
  status: calibrationStatusSchema,
  score: z.number().min(0).max(1),
});

export const calibrationObservationSchema = z.object({
  benchmarkRevision: z.string().min(1),
  agentFamily: z.string().min(1),
  seed: z.string().min(1),
  status: calibrationStatusSchema,
  completionMs: z.number().nonnegative(),
  normalizedActionCost: z.number().nonnegative(),
  tracks: z.array(calibrationTrackObservationSchema).min(1),
}).superRefine((observation, context) => {
  const trackIds = observation.tracks.map((track) => track.id);
  if (new Set(trackIds).size !== trackIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Calibration track ids must be unique within one observation.",
      path: ["tracks"],
    });
  }
});

export type CalibrationObservation = z.infer<typeof calibrationObservationSchema>;

export type ConfidenceInterval = {
  estimate: number;
  lower: number;
  upper: number;
  confidence: 0.95;
  sampleSize: number;
};

export type CalibrationCohortSummary = {
  benchmarkRevision: string;
  runCount: number;
  agentFamilyCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  passRate: ConfidenceInterval;
  completionMs: ConfidenceInterval;
  normalizedActionCost: ConfidenceInterval;
  tracks: Array<{
    id: string;
    score: ConfidenceInterval;
    passRate: ConfidenceInterval;
  }>;
  agentFamilies: Array<{
    id: string;
    runCount: number;
    passRate: ConfidenceInterval;
  }>;
};

export type CalibrationReport = {
  schemaVersion: 1;
  generatedFrom: "deterministic-observations";
  baseline: CalibrationCohortSummary;
  candidate: CalibrationCohortSummary;
  readiness: {
    ready: boolean;
    minimumAgentFamilies: number;
    minimumSeedsPerFamily: number;
    commonAgentFamilies: string[];
    reasons: string[];
  };
  difficultyComparison: {
    measurablyHarder: boolean;
    criterion: "candidate-pass-upper-below-baseline-pass-lower";
    passRateDifference: number;
  };
};

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function wilsonInterval(successes: number, sampleSize: number): ConfidenceInterval {
  if (sampleSize === 0) {
    return { estimate: 0, lower: 0, upper: 0, confidence: 0.95, sampleSize };
  }
  const z = 1.959963984540054;
  const proportion = successes / sampleSize;
  const denominator = 1 + (z * z) / sampleSize;
  const center = (proportion + (z * z) / (2 * sampleSize)) / denominator;
  const margin = z * Math.sqrt(
    (proportion * (1 - proportion) + (z * z) / (4 * sampleSize)) / sampleSize,
  ) / denominator;
  return {
    estimate: rounded(proportion),
    lower: rounded(Math.max(0, center - margin)),
    upper: rounded(Math.min(1, center + margin)),
    confidence: 0.95,
    sampleSize,
  };
}

// Two-sided 95% Student-t critical values for small repeated-seed cohorts.
// Larger cohorts use the normal asymptote.
const tCritical95 = [
  0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
  2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
  2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045,
  2.042,
];

function meanInterval(values: number[], bounds?: { min?: number; max?: number }): ConfidenceInterval {
  if (values.length === 0) {
    return { estimate: 0, lower: 0, upper: 0, confidence: 0.95, sampleSize: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) {
    return {
      estimate: rounded(mean),
      lower: rounded(mean),
      upper: rounded(mean),
      confidence: 0.95,
      sampleSize: 1,
    };
  }
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
    / (values.length - 1);
  const degreesOfFreedom = values.length - 1;
  const critical = tCritical95[degreesOfFreedom] ?? 1.96;
  const margin = critical * Math.sqrt(variance / values.length);
  const lower = Math.max(bounds?.min ?? Number.NEGATIVE_INFINITY, mean - margin);
  const upper = Math.min(bounds?.max ?? Number.POSITIVE_INFINITY, mean + margin);
  return {
    estimate: rounded(mean),
    lower: rounded(lower),
    upper: rounded(upper),
    confidence: 0.95,
    sampleSize: values.length,
  };
}

function summarizeCohort(
  benchmarkRevision: string,
  observations: CalibrationObservation[],
): CalibrationCohortSummary {
  const trackIds = [...new Set(observations.flatMap(
    (observation) => observation.tracks.map((track) => track.id),
  ))].sort();
  const agentFamilies = [...new Set(observations.map((observation) => observation.agentFamily))].sort();
  return {
    benchmarkRevision,
    runCount: observations.length,
    agentFamilyCount: agentFamilies.length,
    passedCount: observations.filter((observation) => observation.status === "passed").length,
    failedCount: observations.filter((observation) => observation.status === "failed").length,
    errorCount: observations.filter((observation) => observation.status === "error").length,
    passRate: wilsonInterval(
      observations.filter((observation) => observation.status === "passed").length,
      observations.length,
    ),
    completionMs: meanInterval(observations.map((observation) => observation.completionMs), { min: 0 }),
    normalizedActionCost: meanInterval(
      observations.map((observation) => observation.normalizedActionCost),
      { min: 0 },
    ),
    tracks: trackIds.map((id) => {
      const tracks = observations.flatMap((observation) =>
        observation.tracks.filter((track) => track.id === id),
      );
      return {
        id,
        score: meanInterval(tracks.map((track) => track.score), { min: 0, max: 1 }),
        passRate: wilsonInterval(
          tracks.filter((track) => track.status === "passed").length,
          tracks.length,
        ),
      };
    }),
    agentFamilies: agentFamilies.map((id) => {
      const runs = observations.filter((observation) => observation.agentFamily === id);
      return {
        id,
        runCount: runs.length,
        passRate: wilsonInterval(
          runs.filter((observation) => observation.status === "passed").length,
          runs.length,
        ),
      };
    }),
  };
}

export function buildCalibrationReport(params: {
  baselineRevision: string;
  candidateRevision: string;
  observations: unknown[];
  minimumAgentFamilies?: number;
  minimumSeedsPerFamily?: number;
}): CalibrationReport {
  if (params.baselineRevision === params.candidateRevision) {
    throw new Error("Baseline and candidate benchmark revisions must differ.");
  }
  const observations = params.observations.map((observation) =>
    calibrationObservationSchema.parse(observation),
  );
  const identities = observations.map((observation) =>
    `${observation.benchmarkRevision}:${observation.agentFamily}:${observation.seed}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new Error("Calibration observations must have unique revision/family/seed identities.");
  }
  const baselineRuns = observations.filter(
    (observation) => observation.benchmarkRevision === params.baselineRevision,
  );
  const candidateRuns = observations.filter(
    (observation) => observation.benchmarkRevision === params.candidateRevision,
  );
  if (baselineRuns.length === 0 || candidateRuns.length === 0) {
    throw new Error("Calibration requires observations for both requested revisions.");
  }

  const minimumAgentFamilies = params.minimumAgentFamilies ?? 3;
  const minimumSeedsPerFamily = params.minimumSeedsPerFamily ?? 2;
  const baselineFamilies = new Set(baselineRuns.map((observation) => observation.agentFamily));
  const candidateFamilies = new Set(candidateRuns.map((observation) => observation.agentFamily));
  const commonAgentFamilies = [...baselineFamilies]
    .filter((family) => candidateFamilies.has(family))
    .sort();
  const reasons: string[] = [];
  if (commonAgentFamilies.length < minimumAgentFamilies) {
    reasons.push(`Need at least ${minimumAgentFamilies} agent families represented in both revisions.`);
  }
  for (const family of commonAgentFamilies) {
    for (const [label, runs] of [["baseline", baselineRuns], ["candidate", candidateRuns]] as const) {
      const seedCount = new Set(
        runs.filter((observation) => observation.agentFamily === family)
          .map((observation) => observation.seed),
      ).size;
      if (seedCount < minimumSeedsPerFamily) {
        reasons.push(`${label} ${family} needs at least ${minimumSeedsPerFamily} repeated seeds.`);
      }
    }
  }

  const baseline = summarizeCohort(params.baselineRevision, baselineRuns);
  const candidate = summarizeCohort(params.candidateRevision, candidateRuns);
  return {
    schemaVersion: 1,
    generatedFrom: "deterministic-observations",
    baseline,
    candidate,
    readiness: {
      ready: reasons.length === 0,
      minimumAgentFamilies,
      minimumSeedsPerFamily,
      commonAgentFamilies,
      reasons,
    },
    difficultyComparison: {
      measurablyHarder: reasons.length === 0
        && candidate.passRate.upper < baseline.passRate.lower,
      criterion: "candidate-pass-upper-below-baseline-pass-lower",
      passRateDifference: rounded(candidate.passRate.estimate - baseline.passRate.estimate),
    },
  };
}
