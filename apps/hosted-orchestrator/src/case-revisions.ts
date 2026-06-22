import { hostedSuiteMetadataSchema } from "@agentbench/test-cases";

export type BenchmarkCaseRevisionRow = {
  id: string;
  case_id: string;
  revision: string;
  content_hash: string;
  manifest: unknown;
};

export async function resolveBenchmarkCaseRevision(params: {
  caseId: string;
  caseRevisionId: string | null;
  loadRevision: (revisionId: string) => Promise<BenchmarkCaseRevisionRow | null>;
}) {
  if (!params.caseRevisionId) {
    throw new Error("Hosted attempt initialization requires a published case revision.");
  }
  const row = await params.loadRevision(params.caseRevisionId);
  if (!row || row.case_id !== params.caseId) {
    throw new Error("Benchmark case revision is unavailable for this case.");
  }
  const parsed = hostedSuiteMetadataSchema.safeParse(row.manifest);
  if (!parsed.success) {
    throw new Error(`Benchmark case revision manifest is invalid: ${parsed.error.message}`);
  }
  return {
    ...parsed.data,
    id: row.id,
    revision: row.revision,
    contentHash: row.content_hash,
  };
}
