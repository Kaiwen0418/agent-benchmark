import { createHash } from "node:crypto";
import {
  hostedWebHardSuiteCase,
  hostedWebHardSuiteMetadata,
  hostedWebHardSuiteRevision,
  hostedWebSuiteCase,
  hostedWebSuiteMetadata,
  hostedWebSuiteRevision,
} from "./index.js";

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

export function createHostedWebHardCatalogRelease() {
  const manifest = hostedWebHardSuiteMetadata;
  return {
    caseId: hostedWebHardSuiteCase.id,
    benchmarkCase: hostedWebHardSuiteCase,
    revision: hostedWebHardSuiteRevision,
    manifest,
    contentHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
}
