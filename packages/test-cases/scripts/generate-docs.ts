import fs from "node:fs";
import path from "node:path";
import { hostedWebSuiteMetadata } from "../src/suites/hosted-web.js";

const root = path.resolve(import.meta.dirname, "../../..");
const target = path.join(root, "docs/hosted-site-app-authoring.md");
const startMarker = "<!-- generated:hosted-testcases:start -->";
const endMarker = "<!-- generated:hosted-testcases:end -->";

function renderTable() {
  const rows = hostedWebSuiteMetadata.sessions.map((session) => {
    const variants = session.metadata.questionVariants
      .map((variant) => `\`${variant.id}\``)
      .join(", ");
    return `| \`${session.taskSlug}\` | \`${session.app}\` | ${variants} |`;
  });
  return [
    startMarker,
    "| Task | App | Variants |",
    "| --- | --- | --- |",
    ...rows,
    endMarker,
  ].join("\n");
}

const current = fs.readFileSync(target, "utf8");
const start = current.indexOf(startMarker);
const end = current.indexOf(endMarker);
if (start === -1 || end === -1 || end < start) {
  throw new Error(`Missing generated testcase markers in ${path.relative(root, target)}.`);
}
const generated = `${current.slice(0, start)}${renderTable()}${current.slice(end + endMarker.length)}`;

if (process.argv.includes("--check")) {
  if (generated !== current) {
    console.error("hosted testcase documentation is stale; run pnpm catalog:generate");
    process.exit(1);
  }
  console.log("generated hosted testcase documentation is current");
} else {
  fs.writeFileSync(target, generated);
  console.log(`generated ${path.relative(root, target)}`);
}
