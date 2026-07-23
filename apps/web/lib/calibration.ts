import type { BenchmarkRun } from "@agentbench/protocol";

export type CalibrationRunSelection = {
  caseRevisionId: string;
  generationSeed: string;
};

type DeploymentEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export function isCalibrationControlsEnabled(
  environment: DeploymentEnvironment = process.env,
) {
  return environment.NODE_ENV === "development"
    || environment.VERCEL_ENV === "preview"
    || environment.VERCEL_GIT_COMMIT_REF === "develop";
}

export function readCalibrationRunSelection(
  run: Pick<BenchmarkRun, "metadata">,
): CalibrationRunSelection | null {
  const calibration = run.metadata?.calibration;
  if (!calibration || typeof calibration !== "object" || Array.isArray(calibration)) {
    return null;
  }

  const candidate = calibration as Record<string, unknown>;
  return typeof candidate.caseRevisionId === "string"
    && typeof candidate.generationSeed === "string"
    && candidate.caseRevisionId.length > 0
    && candidate.generationSeed.length > 0
    ? {
        caseRevisionId: candidate.caseRevisionId,
        generationSeed: candidate.generationSeed,
      }
    : null;
}
