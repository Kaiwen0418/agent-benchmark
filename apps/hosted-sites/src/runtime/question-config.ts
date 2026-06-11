export function readTaskConfig(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    throw new Error("Hosted session is missing generated question metadata.");
  }
  const generation = metadata.questionGeneration;
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) {
    throw new Error("Hosted session is missing questionGeneration metadata.");
  }
  const taskConfig = (generation as Record<string, unknown>).taskConfig;
  if (!taskConfig || typeof taskConfig !== "object" || Array.isArray(taskConfig)) {
    throw new Error("Hosted session is missing a generated taskConfig.");
  }
  return taskConfig as Record<string, unknown>;
}

export type HostedUiVariant = "workspace" | "sidebar" | "compact" | "dashboard" | "editorial";
export type HostedUiTheme = "light" | "dark";

export function readUiVariant(metadata: Record<string, unknown> | null | undefined): HostedUiVariant {
  if (!metadata) {
    return "workspace";
  }
  const generation = metadata.questionGeneration;
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) {
    return "workspace";
  }
  const value = (generation as Record<string, unknown>).uiVariant;
  return value === "sidebar" || value === "compact" || value === "dashboard" || value === "editorial"
    ? value
    : "workspace";
}

export function readUiTheme(metadata: Record<string, unknown> | null | undefined): HostedUiTheme {
  if (!metadata) {
    return "light";
  }
  const generation = metadata.questionGeneration;
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) {
    return "light";
  }
  return (generation as Record<string, unknown>).uiTheme === "dark" ? "dark" : "light";
}

export function configString(config: Record<string, unknown>, key: string) {
  if (typeof config[key] !== "string" || config[key].length === 0) {
    throw new Error(`Generated taskConfig.${key} must be a non-empty string.`);
  }
  return config[key];
}

export function configNumber(config: Record<string, unknown>, key: string) {
  if (typeof config[key] !== "number" || !Number.isFinite(config[key])) {
    throw new Error(`Generated taskConfig.${key} must be a finite number.`);
  }
  return config[key];
}

export function configBoolean(config: Record<string, unknown>, key: string) {
  if (typeof config[key] !== "boolean") {
    throw new Error(`Generated taskConfig.${key} must be a boolean.`);
  }
  return config[key];
}
