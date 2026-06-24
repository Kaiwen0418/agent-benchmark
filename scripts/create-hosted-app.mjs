#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const slug = process.argv[2];
if (!slug || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-lite$/.test(slug)) {
  throw new Error("Usage: pnpm create-hosted-app <kebab-case-lite>");
}

const root = process.env.HOSTED_APP_ROOT
  ? resolve(process.env.HOSTED_APP_ROOT)
  : resolve(import.meta.dirname, "..");
const hostedDir = join(root, "apps/hosted-sites/src/apps", slug);
const testcaseDir = join(root, "packages/test-cases/src/apps", slug);
if (existsSync(hostedDir) || existsSync(testcaseDir)) {
  throw new Error(`Hosted app ${slug} already exists.`);
}

const identifier = slug
  .split("-")
  .map((part, index) => index === 0 ? part : part[0].toUpperCase() + part.slice(1))
  .join("");
const typeName = identifier[0].toUpperCase() + identifier.slice(1);
const routeBase = `/${slug.replace(/-lite$/, "")}`;

const hostedFiles = {
  "types.ts": `export type Submission = {
  id: string;
  value: string;
  createdAt: string;
};

export type AppSessionState = {
  submissions: Submission[];
};
`,
  "seed.ts": `export function get${typeName}StartPath() {
  return "${routeBase}";
}

export function get${typeName}DefaultGoal() {
  return "Submit the requested value.";
}
`,
  "actions.ts": `import type { HostedSessionFor } from "../../runtime/types.js";

export function createSubmission(
  session: HostedSessionFor<"${slug}">,
  input: { value: string; makeId: (prefix: string) => string; now: () => string },
) {
  const submission = {
    id: input.makeId("submission"),
    value: input.value.trim(),
    createdAt: input.now(),
  };
  session.state.submissions.push(submission);
  return submission;
}
`,
  "evaluate.ts": `import { aggregateStrictScore, failedEvaluator, passedEvaluator, type HostedWebScoreResult } from "@agentbench/scoring";
import { configString, readTaskConfig } from "../../runtime/question-config.js";
import type { HostedSessionFor } from "../../runtime/types.js";

export function evaluate${typeName}(session: HostedSessionFor<"${slug}">): HostedWebScoreResult {
  const expectedValue = configString(readTaskConfig(session.metadata), "expectedValue");
  const match = session.state.submissions.find((submission) => submission.value === expectedValue);
  return aggregateStrictScore({
    evaluators: [
      match
        ? passedEvaluator({ type: "backend_state", name: "expected submission exists", evidence: { submissionId: match.id } })
        : failedEvaluator({ type: "backend_state", name: "expected submission exists", errorMessage: "Expected value was not submitted.", evidence: { submissionCount: session.state.submissions.length } }),
    ],
    passSummary: "The requested value was submitted.",
    failSummary: "The requested value was not submitted.",
  });
}
`,
  "final-state.ts": `import type { HostedSessionFor } from "../../runtime/types.js";

export function build${typeName}FinalState(session: HostedSessionFor<"${slug}">) {
  return {
    app: "${slug}",
    taskSlug: session.taskSlug,
    submissions: session.state.submissions,
  };
}
`,
  "render.ts": `import type { ServerResponse } from "node:http";
import type { HostedSessionFor } from "../../runtime/types.js";
import { escapeHtml, layout, sendHtml } from "../../templates.js";

export function render${typeName}(
  session: HostedSessionFor<"${slug}">,
  response: ServerResponse,
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
) {
  sendHtml(response, 200, layout({
    title: "${typeName}",
    session,
    publicBaseUrl,
    defaultStartPathForApp,
    body: \`<section class="panel">
      <form method="post" action="${routeBase}/submit?session=\${encodeURIComponent(session.token)}">
        <label>Value <input name="value" /></label>
        <button type="submit">Submit</button>
      </form>
      <p class="muted">Submissions: \${escapeHtml(String(session.state.submissions.length))}</p>
    </section>\`,
  }));
}
`,
  "routes.ts": `import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostedAppRouteDeps } from "../../runtime/app-definition.js";
import { redirect, sendJson } from "../../runtime/http.js";
import { isHostedSessionForApp } from "../../runtime/types.js";
import { createSubmission } from "./actions.js";
import { render${typeName} } from "./render.js";

export function create${typeName}Routes(deps: HostedAppRouteDeps) {
  async function getSession(url: URL, request: IncomingMessage) {
    const session = await deps.getSession(url, request);
    return session && isHostedSessionForApp(session, "${slug}") ? session : null;
  }
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    const session = await getSession(url, request);
    if ((url.pathname === "${routeBase}" || url.pathname === "${routeBase}/submit") && !session) {
      deps.badRequest(response, "Missing or invalid session");
      return true;
    }
    if (request.method === "GET" && url.pathname === "${routeBase}") {
      render${typeName}(session!, response, deps.publicBaseUrl, deps.defaultStartPathForApp);
      return true;
    }
    if (request.method === "POST" && url.pathname === "${routeBase}/submit") {
      if (deps.rejectTerminalMutation(session!, response)) return true;
      const value = (await deps.readForm(request)).get("value");
      if (typeof value !== "string" || value.trim().length === 0) {
        deps.badRequest(response, "Value is required");
        return true;
      }
      createSubmission(session!, { value, makeId: deps.makeId, now: deps.now });
      await deps.persistSessionSnapshot(session!);
      const completed = await deps.completeSession(session!, deps.evaluateSession(session!));
      if (!completed) {
        sendJson(response, 502, { error: "Hosted orchestrator unavailable" });
        return true;
      }
      redirect(response, \`${routeBase}?session=\${encodeURIComponent(session!.token)}\`);
      return true;
    }
    return false;
  }
  return { handle };
}
`,
  "definition.ts": `import { isStateRecord, readStateArray, type HostedAppDefinition } from "../../runtime/app-definition.js";
import { evaluate${typeName} } from "./evaluate.js";
import { build${typeName}FinalState } from "./final-state.js";
import { create${typeName}Routes } from "./routes.js";
import { get${typeName}DefaultGoal, get${typeName}StartPath } from "./seed.js";
import type { Submission } from "./types.js";

function isSubmission(value: unknown): value is Submission {
  return isStateRecord(value) && typeof value.id === "string" && typeof value.value === "string" && typeof value.createdAt === "string";
}

export const ${identifier}Definition: HostedAppDefinition<"${slug}"> = {
  id: "${slug}",
  stateKeys: ["submissions"],
  getDefaultStartPath: get${typeName}StartPath,
  getDefaultGoal: get${typeName}DefaultGoal,
  buildInitialSessionState: () => ({ submissions: [] }),
  hydratePersistedState: (value) => ({ submissions: readStateArray(value, "submissions", isSubmission) }),
  buildFinalState: build${typeName}FinalState,
  evaluate: evaluate${typeName},
  createRoutes: (deps) => [create${typeName}Routes(deps).handle],
};
`,
  "test-support.ts": `import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const ${identifier}TestSupport: HostedAppTestSupport<"${slug}"> = {
  exampleTaskConfig: { expectedValue: "example-value" },
  applyPassingState(session, config) {
    session.state.submissions.push({ id: "submission-test", value: configString(config, "expectedValue"), createdAt: "2026-01-01T00:00:00.000Z" });
  },
  breakPassingState(session) {
    session.state.submissions[0]!.value = "wrong-value";
  },
};
`,
  "test-driver.mjs": `export async function complete({ session, config, postForm, requireString }) {
  await postForm("${routeBase}/submit", session.token, {
    value: requireString(config.expectedValue, "${slug} expectedValue"),
  });
}
`,
};

const testcaseDefinition = `import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const ${identifier}TestcaseDefinition = defineHostedTestcaseApp({
  app: "${slug}",
  taskConfigSchema: z.object({
    expectedValue: z.string().min(1),
  }),
  variantPools: {
    default: [
      { id: "example-a", goal: "Submit example value A.", taskConfig: { expectedValue: "example-a" } },
      { id: "example-b", goal: "Submit example value B.", taskConfig: { expectedValue: "example-b" } },
    ],
  },
});
`;

await mkdir(hostedDir, { recursive: true });
await mkdir(testcaseDir, { recursive: true });
await Promise.all([
  ...Object.entries(hostedFiles).map(([name, contents]) => writeFile(join(hostedDir, name), contents)),
  writeFile(join(testcaseDir, "definition.ts"), testcaseDefinition),
]);

if (!process.argv.includes("--skip-generate")) {
  for (const [filter, command] of [
    ["hosted-sites", "generate-registry"],
    ["@agentbench/test-cases", "generate-registry"],
  ]) {
    const result = spawnSync("pnpm", ["--filter", filter, command], { cwd: root, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

console.log(`created ${slug}; add its session explicitly to packages/test-cases/src/suites/hosted-web.ts`);
