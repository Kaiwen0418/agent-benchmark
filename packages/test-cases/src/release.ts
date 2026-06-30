import { createHash } from "node:crypto";
import { hostedWebSuites, type HostedSuiteDefinition } from "./suites/registry.js";

export function createCatalogRelease(suite: HostedSuiteDefinition) {
  const manifest = suite.metadata;
  return {
    caseId: suite.case.id,
    benchmarkCase: suite.case,
    revision: suite.revision,
    manifest,
    contentHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
}

export const hostedWebCatalogReleases = () => hostedWebSuites.map(createCatalogRelease);
