import { createHash } from "node:crypto";
import { hostedWebSuiteCase, hostedWebSuiteMetadata, hostedWebSuiteRevision } from "./index.js";

export function createHostedWebCatalogRelease() {
  const manifest = hostedWebSuiteMetadata;
  return {
    caseId: hostedWebSuiteCase.id,
    benchmarkCase: hostedWebSuiteCase,
    revision: hostedWebSuiteRevision,
    manifest,
    contentHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
}
