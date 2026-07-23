import {
  modelCatalogSources,
  type ModelCatalogSourceName,
} from "./sources.js";
import { syncModelCatalogSource } from "./sync.js";

export function parseModelCatalogSource(value: string | undefined): ModelCatalogSourceName {
  if (!value || !Object.hasOwn(modelCatalogSources, value)) {
    throw new Error(
      `Unknown model catalog source "${value ?? ""}". Expected one of: ${
        Object.keys(modelCatalogSources).join(", ")
      }.`,
    );
  }
  return value as ModelCatalogSourceName;
}

async function main() {
  const source = parseModelCatalogSource(process.argv[2]);
  const result = await syncModelCatalogSource(source);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown model catalog sync error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
