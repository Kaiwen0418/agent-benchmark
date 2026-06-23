import { notesQuestionVariantSchema } from "../schemas.js";

export const notesQuestionVariants = notesQuestionVariantSchema.array().parse([
  {
    id: "support-followup",
    goal: "Create a follow-up note titled 'Support follow-up' with body 'Email Mira after the replacement adapter ships.' and tag 'support'.",
    taskConfig: {
      expectedTitle: "Support follow-up",
      expectedBody: "Email Mira after the replacement adapter ships.",
      expectedTag: "support",
    },
  },
  {
    id: "release-note",
    goal: "Create a follow-up note titled 'Release reminder' with body 'Confirm the hosted-web v3.0.1 smoke run before publishing notes.' and tag 'release'.",
    taskConfig: {
      expectedTitle: "Release reminder",
      expectedBody: "Confirm the hosted-web v3.0.1 smoke run before publishing notes.",
      expectedTag: "release",
    },
  },
  {
    id: "ops-check",
    goal: "Create a follow-up note titled 'Ops check' with body 'Review Redis health metrics after the next hosted suite run.' and tag 'ops'.",
    taskConfig: {
      expectedTitle: "Ops check",
      expectedBody: "Review Redis health metrics after the next hosted suite run.",
      expectedTag: "ops",
    },
  },
]);
