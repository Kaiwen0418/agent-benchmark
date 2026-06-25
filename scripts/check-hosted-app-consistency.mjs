#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const hostedAppsDir = join(root, "apps/hosted-sites/src/apps");
const testcaseAppsDir = join(root, "packages/test-cases/src/apps");
const requiredHostedFiles = [
  "actions.ts",
  "definition.ts",
  "evaluate.ts",
  "final-state.ts",
  "render.ts",
  "routes.ts",
  "seed.ts",
  "test-driver.mjs",
  "test-support.ts",
  "types.ts",
];

async function directoryNames(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const hostedApps = await directoryNames(hostedAppsDir);
const testcaseApps = await directoryNames(testcaseAppsDir);
const errors = [];

for (const app of hostedApps) {
  for (const file of requiredHostedFiles) {
    if (!existsSync(join(hostedAppsDir, app, file))) {
      errors.push(`hosted app ${app} is missing ${file}`);
    }
  }
  if (!testcaseApps.includes(app)) {
    errors.push(`hosted app ${app} has no testcase definition`);
  }
}
for (const app of testcaseApps) {
  if (!existsSync(join(testcaseAppsDir, app, "definition.ts"))) {
    errors.push(`testcase app ${app} is missing definition.ts`);
  }
  if (!hostedApps.includes(app)) {
    errors.push(`testcase app ${app} has no hosted-sites implementation`);
  }
}

const suiteSource = await readFile(join(root, "packages/test-cases/src/suites/hosted-web.ts"), "utf8");
for (const app of [...suiteSource.matchAll(/app:\s*"([^"]+)"/g)].map((match) => match[1])) {
  if (!testcaseApps.includes(app)) {
    errors.push(`suite references unknown testcase app ${app}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`hosted app consistency passed for ${hostedApps.length} apps`);
