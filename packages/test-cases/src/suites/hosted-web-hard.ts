import { hostedWebCapabilitySuiteMetadata } from "./hosted-web-capability-draft.js";

export const hostedWebHardSuiteMetadata = hostedWebCapabilitySuiteMetadata;

export const hostedWebHardSuiteRevision = "hosted-web-hard-suite-v1.1.0";

export const hostedWebHardSuiteCase = {
  id: "bb7e5cd4-f3ed-4aa0-9fcc-46fec39997eb",
  slug: "hosted-web-hard-suite",
  title: "Hosted Web Hard Suite",
  description: "Run the capability-complete deterministic hosted-web hard benchmark suite.",
  category: "browser",
  difficulty: "hard",
  provider: "hosted-web" as const,
  metadata: {},
  isPublic: true,
};
