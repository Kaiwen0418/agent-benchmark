import crypto from "node:crypto";

export type QuestionVariant = {
  id: string;
  goal: string;
  title?: string | null;
  taskConfig: Record<string, unknown>;
};

const UI_VARIANTS = ["workspace", "sidebar", "compact", "dashboard", "editorial"] as const;
const UI_THEMES = ["light", "dark"] as const;

type QuestionSession = {
  app: string;
  taskSlug: string;
  sequenceIndex: number;
  title: string | null;
  goal: string | null;
  seedVersion: string | null;
  metadata: Record<string, unknown>;
};

type GeneratedQuestionSession<TSession extends QuestionSession> = Omit<
  TSession,
  "title" | "goal" | "seedVersion" | "metadata"
> & {
  title: string | null;
  goal: string;
  seedVersion: string | null;
  metadata: Record<string, unknown>;
};

function readQuestionVariants(metadata: Record<string, unknown>): QuestionVariant[] {
  if (!Array.isArray(metadata.questionVariants)) {
    throw new Error("Hosted session is missing metadata.questionVariants.");
  }

  const variants = metadata.questionVariants.map((value, index): QuestionVariant => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Question variant at index ${index} must be an object.`);
    }
    const variant = value as Record<string, unknown>;
    if (typeof variant.id !== "string" || variant.id.trim().length === 0) {
      throw new Error(`Question variant at index ${index} must have a non-empty id.`);
    }
    if (typeof variant.goal !== "string" || variant.goal.trim().length === 0) {
      throw new Error(`Question variant ${variant.id} must have a non-empty goal.`);
    }
    if (!variant.taskConfig || typeof variant.taskConfig !== "object" || Array.isArray(variant.taskConfig)) {
      throw new Error(`Question variant ${variant.id} must have a taskConfig object.`);
    }
    if (Object.keys(variant.taskConfig).length === 0) {
      throw new Error(`Question variant ${variant.id} must not have an empty taskConfig.`);
    }
    return {
      id: variant.id,
      goal: variant.goal,
      title: typeof variant.title === "string" ? variant.title : null,
      taskConfig: variant.taskConfig as Record<string, unknown>,
    };
  });

  if (variants.length < 2) {
    throw new Error("Hosted session must define at least two question variants.");
  }
  if (new Set(variants.map((variant) => variant.id)).size !== variants.length) {
    throw new Error("Hosted session question variant ids must be unique.");
  }
  return variants;
}

function variantIndex(seed: string, session: QuestionSession, count: number) {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:${session.sequenceIndex}:${session.app}:${session.taskSlug}`)
    .digest();
  return digest.readUInt32BE(0) % count;
}

function uiVariant(seed: string, session: QuestionSession) {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:ui:${session.sequenceIndex}:${session.app}:${session.taskSlug}`)
    .digest();
  return UI_VARIANTS[digest.readUInt32BE(0) % UI_VARIANTS.length];
}

function uiTheme(seed: string, session: QuestionSession) {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:theme:${session.sequenceIndex}:${session.app}:${session.taskSlug}`)
    .digest();
  return UI_THEMES[digest.readUInt32BE(0) % UI_THEMES.length];
}

export function generateAttemptQuestions<TSession extends QuestionSession>(
  sessions: TSession[],
  generationSeed: string = crypto.randomUUID(),
): { generationSeed: string; sessions: GeneratedQuestionSession<TSession>[] } {
  return {
    generationSeed,
    sessions: sessions.map((session) => {
      const variants = readQuestionVariants(session.metadata);
      const selectedUiVariant = uiVariant(generationSeed, session);
      const selectedUiTheme = uiTheme(generationSeed, session);
      const variant = variants[variantIndex(generationSeed, session, variants.length)];
      const { questionVariants: _questionVariants, ...sourceMetadata } = session.metadata;
      return {
        ...session,
        title: variant.title ?? session.title,
        goal: variant.goal,
        seedVersion: `${session.seedVersion ?? `${session.app}-v1`}:${variant.id}`,
        metadata: {
          ...sourceMetadata,
          questionGeneration: {
            schemaVersion: 2,
            generationSeed,
            variantId: variant.id,
            uiVariant: selectedUiVariant,
            uiTheme: selectedUiTheme,
            taskConfig: variant.taskConfig,
          },
        },
      };
    }),
  };
}
