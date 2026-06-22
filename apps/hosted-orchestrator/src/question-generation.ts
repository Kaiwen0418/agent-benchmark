import crypto from "node:crypto";
import { parseQuestionVariants } from "@agentbench/test-cases";

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
      const variants = parseQuestionVariants(session.app, session.metadata.questionVariants) as QuestionVariant[];
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
            schemaVersion: 3,
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
