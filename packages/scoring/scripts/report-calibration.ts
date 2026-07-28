import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCalibrationReport } from "../src/calibration.js";

const [inputPath, baselineRevision, candidateRevision] = process.argv.slice(2);
if (!inputPath || !baselineRevision || !candidateRevision) {
  throw new Error(
    "Usage: pnpm calibration:report <observations.json> <baseline-revision> <candidate-revision>",
  );
}

const observations = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
if (!Array.isArray(observations)) {
  throw new Error("Calibration input must be a JSON array of observations.");
}

process.stdout.write(`${JSON.stringify(buildCalibrationReport({
  baselineRevision,
  candidateRevision,
  observations,
}), null, 2)}\n`);
