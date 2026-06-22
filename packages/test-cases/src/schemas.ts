import { z } from "zod";

export const questionVariantBaseSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  title: z.string().min(1).nullable().optional(),
});

export const shoppingTaskConfigSchema = z.object({
  targetCategory: z.enum(["charger", "cable", "adapter", "case"]),
  quantity: z.number().int().positive(),
  maxTotal: z.number().positive(),
  shippingMethod: z.enum(["standard", "express"]),
  avoidRestricted: z.boolean(),
});

export const forumTaskConfigSchema = z.object({
  targetThreadId: z.string().min(1),
  expectedReplyValue: z.string().url(),
  expectedLockReason: z.string().min(1),
});

export const repoTaskConfigSchema = z.object({
  filePath: z.string().min(1),
  expectedText: z.string().min(1),
  forbiddenText: z.string().min(1),
  expectedMrTitle: z.string().min(1),
  expectedTargetBranch: z.string().min(1),
});

export const wikiAnswerContractSchema = z.object({
  kind: z.enum(["date", "duration", "currency"]),
  canonicalValue: z.string().min(1),
  normalization: z.enum(["trim", "trim-casefold", "trim-casefold-punctuation"]),
  sourceArticleSlug: z.string().min(1),
});

export const wikiTaskConfigSchema = z.object({
  targetArticleSlug: z.string().min(1),
  answerContract: wikiAnswerContractSchema,
}).superRefine((config, context) => {
  if (config.targetArticleSlug !== config.answerContract.sourceArticleSlug) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wiki sourceArticleSlug must match targetArticleSlug.",
      path: ["answerContract", "sourceArticleSlug"],
    });
  }
});

export const shoppingQuestionVariantSchema = questionVariantBaseSchema.extend({
  taskConfig: shoppingTaskConfigSchema,
});
export const forumQuestionVariantSchema = questionVariantBaseSchema.extend({
  taskConfig: forumTaskConfigSchema,
});
export const repoQuestionVariantSchema = questionVariantBaseSchema.extend({
  taskConfig: repoTaskConfigSchema,
});
export const wikiQuestionVariantSchema = questionVariantBaseSchema.extend({
  taskConfig: wikiTaskConfigSchema,
});

function sessionSchema<TApp extends string, TConfig extends z.ZodTypeAny>(app: TApp, variant: TConfig) {
  return z.object({
    app: z.literal(app),
    taskSlug: z.string().min(1),
    title: z.string().min(1),
    startPath: z.string().startsWith("/").optional(),
    taskVersion: z.string().min(1),
    seedVersion: z.string().min(1),
    sequenceIndex: z.number().int().nonnegative(),
    weight: z.number().nonnegative(),
    required: z.boolean(),
    metadata: z.object({
      questionVariants: z.array(variant).min(2),
    }),
  });
}

export const shoppingSessionSchema = sessionSchema("shopping-lite", shoppingQuestionVariantSchema);
export const forumSessionSchema = sessionSchema("forum-lite", forumQuestionVariantSchema);
export const repoSessionSchema = sessionSchema("repo-lite", repoQuestionVariantSchema);
export const wikiSessionSchema = sessionSchema("wiki-lite", wikiQuestionVariantSchema);

export const hostedSessionDefinitionSchema = z.discriminatedUnion("app", [
  shoppingSessionSchema,
  forumSessionSchema,
  repoSessionSchema,
  wikiSessionSchema,
]);

export const hostedSuiteMetadataSchema = z.object({
  suiteSlug: z.string().min(1),
  suiteVersion: z.string().min(1),
  sessions: z.array(hostedSessionDefinitionSchema).min(1),
}).superRefine((suite, context) => {
  const indexes = suite.sessions.map((session) => session.sequenceIndex);
  if (new Set(indexes).size !== indexes.length || indexes.some((value, index) => value !== index)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hosted suite sequence indexes must be unique and contiguous from zero.",
      path: ["sessions"],
    });
  }
  for (const [index, session] of suite.sessions.entries()) {
    const ids = session.metadata.questionVariants.map((variant) => variant.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Question variant ids must be unique for ${session.app}.`,
        path: ["sessions", index, "metadata", "questionVariants"],
      });
    }
  }
});

export type HostedSessionDefinition = z.infer<typeof hostedSessionDefinitionSchema>;
export type HostedSuiteMetadata = z.infer<typeof hostedSuiteMetadataSchema>;
export type HostedQuestionVariant = HostedSessionDefinition["metadata"]["questionVariants"][number];

export function parseQuestionVariants(app: string, value: unknown): HostedQuestionVariant[] {
  if (!Array.isArray(value)) {
    throw new Error("Hosted session is missing metadata.questionVariants.");
  }
  if (value.length < 2) {
    throw new Error("Hosted session must define at least two question variants.");
  }
  const schema = {
    "shopping-lite": shoppingQuestionVariantSchema,
    "forum-lite": forumQuestionVariantSchema,
    "repo-lite": repoQuestionVariantSchema,
    "wiki-lite": wikiQuestionVariantSchema,
  }[app];
  if (!schema) {
    throw new Error(`Unsupported hosted app ${app}.`);
  }
  const variants = z.array(schema).parse(value) as HostedQuestionVariant[];
  if (new Set(variants.map((variant) => variant.id)).size !== variants.length) {
    throw new Error("Hosted session question variant ids must be unique.");
  }
  return variants;
}
