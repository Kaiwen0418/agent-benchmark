export type PublicConsistencyCheck = {
  sequenceIndex: number;
  name: string;
  sourceTaskSlug: string;
  targetTaskSlug: string;
  status: "passed" | "failed";
  score: number;
  required: boolean;
  failureReason: string | null;
};

export function summarizePublicConsistencyChecks(checks: PublicConsistencyCheck[]) {
  const required = checks.filter((check) => check.required);
  return {
    total: checks.length,
    requiredTotal: required.length,
    requiredPassed: required.filter((check) => check.status === "passed").length,
  };
}
