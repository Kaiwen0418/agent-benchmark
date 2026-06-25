import { z } from "zod";

export const questionVariantBaseSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  title: z.string().min(1).nullable().optional(),
});

export function defineHostedTestcaseApp<
  TApp extends string,
  TConfigSchema extends z.ZodTypeAny,
  TPools extends Record<string, readonly unknown[]>,
>(input: {
  app: TApp;
  taskConfigSchema: TConfigSchema;
  variantPools: TPools;
}) {
  const questionVariantSchema = questionVariantBaseSchema.extend({
    taskConfig: input.taskConfigSchema,
  });
  const parsedPools = Object.fromEntries(
    Object.entries(input.variantPools).map(([name, variants]) => [
      name,
      questionVariantSchema.array().min(2).parse(variants),
    ]),
  ) as {
    [TName in keyof TPools]: Array<z.infer<typeof questionVariantSchema>>;
  };

  return {
    app: input.app,
    taskConfigSchema: input.taskConfigSchema,
    questionVariantSchema,
    variantPools: parsedPools,
  };
}

export function createHostedSessionSchema<
  TApp extends string,
  TVariantSchema extends z.ZodTypeAny,
>(app: TApp, variantSchema: TVariantSchema) {
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
      questionVariants: z.array(variantSchema).min(2),
    }),
  });
}
