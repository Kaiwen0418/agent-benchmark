import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const notesLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "notes-lite",
  taskConfigSchema: z.object({
    expectedTitle: z.string().min(1),
    expectedBody: z.string().min(1),
    expectedTag: z.string().min(1),
    targetNoteId: z.string().min(1).optional(),
  }),
  variantPools: {
    default: [
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
      {
        id: "update-support-followup",
        goal: "Update the seeded note titled 'Old support follow-up' to title 'Support follow-up', body 'Email Mira after the replacement adapter ships.', and tag 'support'.",
        taskConfig: {
          expectedTitle: "Support follow-up",
          expectedBody: "Email Mira after the replacement adapter ships.",
          expectedTag: "support",
          targetNoteId: "note-seed-support",
        },
      },
      {
        id: "update-release-note",
        goal: "Update the seeded note titled 'Old release reminder' to title 'Release reminder', body 'Confirm the hosted-web v3.0.1 smoke run before publishing notes.', and tag 'release'.",
        taskConfig: {
          expectedTitle: "Release reminder",
          expectedBody: "Confirm the hosted-web v3.0.1 smoke run before publishing notes.",
          expectedTag: "release",
          targetNoteId: "note-seed-release",
        },
      },
      {
        id: "update-ops-check",
        goal: "Update the seeded note titled 'Old ops check' to title 'Ops check', body 'Review Redis health metrics after the next hosted suite run.', and tag 'ops'.",
        taskConfig: {
          expectedTitle: "Ops check",
          expectedBody: "Review Redis health metrics after the next hosted suite run.",
          expectedTag: "ops",
          targetNoteId: "note-seed-ops",
        },
      },
    ],
  },
});
