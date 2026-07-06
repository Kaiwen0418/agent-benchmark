import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const notesLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "notes-lite",
  taskConfigSchema: z.object({
    // Optional so cross-app "carry" variants can leave the title unpinned: the
    // title is whatever the agent retrieved in an earlier session, verified by a
    // suite-level consistency check rather than this per-session evaluator.
    expectedTitle: z.string().min(1).optional(),
    // Hard cross-app carry variants leave both title and body unpinned. Their
    // values are verified against prior session final states at suite level.
    expectedBody: z.string().min(1).optional(),
    expectedTag: z.string().min(1),
    targetNoteId: z.string().min(1).optional(),
    expectedNotes: z
      .array(
        z.object({
          title: z.string().min(1),
          body: z.string().min(1),
          tag: z.string().min(1),
        }),
      )
      .min(2)
      .optional(),
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
    // Hard cross-app carry variants (#115). Title and body are intentionally
    // unpinned: the agent must carry the two earlier wiki answers into distinct
    // fields. Per-session scoring requires non-empty fields and the exact tag;
    // suite-level checks verify both carried values.
    hard: [
      {
        id: "carry-release-answer",
        goal: "Open the note you need to file as a follow-up. Set the title to exactly the answer you submitted in the earlier wiki release-lookup task, set the body to exactly the answer you submitted in the later wiki policy-lookup task (no extra words in either field), and set the tag to 'release'.",
        taskConfig: {
          expectedTag: "release",
          targetNoteId: "note-seed-release",
        },
      },
      {
        id: "carry-release-summary",
        goal: "Create a summary note. Set the title to exactly the answer you submitted in the earlier wiki release-lookup task, set the body to exactly the answer you submitted in the later wiki policy-lookup task (no extra words in either field), and set the tag to 'summary'.",
        taskConfig: {
          expectedTag: "summary",
        },
      },
      {
        id: "release-rollout-note-set",
        goal: "Create and organize all three rollout notes: (1) title 'API v3 implementation', body 'Track the implementation branch and conflict resolution.', tag 'implementation'; (2) title 'API v3 verification', body 'Record CI, reviewer, and compatibility evidence.', tag 'verification'; and (3) title 'API v3 release', body 'Schedule publication after verification passes.', tag 'release'. Create exactly these required notes.",
        taskConfig: {
          expectedTag: "project",
          expectedNotes: [
            { title: "API v3 implementation", body: "Track the implementation branch and conflict resolution.", tag: "implementation" },
            { title: "API v3 verification", body: "Record CI, reviewer, and compatibility evidence.", tag: "verification" },
            { title: "API v3 release", body: "Schedule publication after verification passes.", tag: "release" },
          ],
        },
      },
    ],
  },
});
