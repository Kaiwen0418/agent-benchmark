import { createHash } from "node:crypto";
import { hostedWebSuiteCase, hostedWebSuiteRevision } from "./index.js";

export function createHostedWebCatalogRelease() {
  const manifest = hostedWebSuiteCase.metadata;
  return {
    caseId: hostedWebSuiteCase.id,
    revision: hostedWebSuiteRevision,
    manifest,
    contentHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
}
