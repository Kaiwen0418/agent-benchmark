import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

export const calendarLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "calendar-lite",
  taskConfigSchema: z.object({
    expectedTitle: z.string().min(1),
    expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expectedStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    expectedDurationMinutes: z.number().int().positive(),
    expectedAttendeeEmail: z.string().email(),
  }),
  variantPools: {
    default: [
      {
        id: "architecture-review",
        goal: "Create an event titled 'Architecture review' on July 8, 2026 at 14:30 for 45 minutes with attendee mira@example.com.",
        taskConfig: { expectedTitle: "Architecture review", expectedDate: "2026-07-08", expectedStartTime: "14:30", expectedDurationMinutes: 45, expectedAttendeeEmail: "mira@example.com" },
      },
      {
        id: "release-readiness",
        goal: "Create an event titled 'Release readiness' on July 10, 2026 at 09:00 for 30 minutes with attendee ops@example.com.",
        taskConfig: { expectedTitle: "Release readiness", expectedDate: "2026-07-10", expectedStartTime: "09:00", expectedDurationMinutes: 30, expectedAttendeeEmail: "ops@example.com" },
      },
      {
        id: "scoring-retro",
        goal: "Create an event titled 'Scoring retrospective' on July 14, 2026 at 16:00 for 60 minutes with attendee evals@example.com.",
        taskConfig: { expectedTitle: "Scoring retrospective", expectedDate: "2026-07-14", expectedStartTime: "16:00", expectedDurationMinutes: 60, expectedAttendeeEmail: "evals@example.com" },
      },
    ],
  },
});
