import type { HostedSuiteMetadata } from "../schemas.js";
import {
  hostedWebSuiteCase,
  hostedWebSuiteMetadata,
  hostedWebSuiteRevision,
} from "./hosted-web.js";
import {
  hostedWebHardSuiteCase,
  hostedWebHardSuiteMetadata,
  hostedWebHardSuiteRevision,
} from "./hosted-web-hard.js";

// Display-and-catalog shape shared by every hosted-web suite case. `difficulty`
// is just a tag on the row; nothing branches on suite identity.
export interface HostedSuiteCase {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  provider: "hosted-web";
  metadata: Record<string, unknown>;
  isPublic: boolean;
}

export interface HostedSuiteDefinition {
  case: HostedSuiteCase;
  metadata: HostedSuiteMetadata;
  revision: string;
}

// The single authoritative list of hosted-web suites. Add a new suite by
// creating its source file and appending one entry here — release/publish/seed
// tooling all iterate this list, so no other file names a suite.
export const hostedWebSuites: HostedSuiteDefinition[] = [
  {
    case: hostedWebSuiteCase,
    metadata: hostedWebSuiteMetadata,
    revision: hostedWebSuiteRevision,
  },
  {
    case: hostedWebHardSuiteCase,
    metadata: hostedWebHardSuiteMetadata,
    revision: hostedWebHardSuiteRevision,
  },
];
