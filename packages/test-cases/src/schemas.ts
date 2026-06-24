import { z } from "zod";
import { hostedSessionDefinitionSchema } from "./generated-app-registry.js";

export { hostedSessionDefinitionSchema, parseQuestionVariants } from "./generated-app-registry.js";

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
