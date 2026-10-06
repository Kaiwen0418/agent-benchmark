export type RunCreationMode = "open" | "frozen";

export function getRunCreationMode(
  value = process.env.RUN_CREATION_MODE,
): RunCreationMode {
  if (value === undefined || value === "" || value === "open") return "open";
  return "frozen";
}

export function isRunCreationAllowed(value = process.env.RUN_CREATION_MODE) {
  return getRunCreationMode(value) === "open";
}
