import { z } from "zod";
import { defineHostedTestcaseApp } from "../../app-definition.js";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const clockTime = /^\d{2}:\d{2}$/;

// A pre-existing commitment the agent must schedule around. These are read-only
// context surfaced in the UI; they are never the evaluator answer themselves.
const busyEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string().regex(isoDate),
  startTime: z.string().regex(clockTime),
  durationMinutes: z.number().int().positive(),
  attendeeEmail: z.string().email(),
  secondaryAttendeeEmail: z.string().email().optional(),
});

export const calendarLiteTestcaseDefinition = defineHostedTestcaseApp({
  app: "calendar-lite",
  taskConfigSchema: z.object({
    expectedTitle: z.string().min(1),
    expectedDate: z.string().regex(isoDate),
    expectedStartTime: z.string().regex(clockTime),
    expectedDurationMinutes: z.number().int().positive(),
    expectedAttendeeEmail: z.string().email(),
    expectedSecondaryAttendeeEmail: z.string().email().optional(),
    // Hard-suite availability constraints (optional; absent on the easy pool).
    seedBusyEvents: z.array(busyEventSchema).min(1).optional(),
    schedulingWindowStart: z.string().regex(clockTime).optional(),
    schedulingWindowEnd: z.string().regex(clockTime).optional(),
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
      {
        id: "architecture-review-plus-lead",
        goal: "Create an event titled 'Architecture review' on July 8, 2026 at 14:30 for 45 minutes with attendees mira@example.com and lead@example.com.",
        taskConfig: { expectedTitle: "Architecture review", expectedDate: "2026-07-08", expectedStartTime: "14:30", expectedDurationMinutes: 45, expectedAttendeeEmail: "mira@example.com", expectedSecondaryAttendeeEmail: "lead@example.com" },
      },
      {
        id: "release-readiness-plus-pm",
        goal: "Create an event titled 'Release readiness' on July 10, 2026 at 09:00 for 30 minutes with attendees ops@example.com and pm@example.com.",
        taskConfig: { expectedTitle: "Release readiness", expectedDate: "2026-07-10", expectedStartTime: "09:00", expectedDurationMinutes: 30, expectedAttendeeEmail: "ops@example.com", expectedSecondaryAttendeeEmail: "pm@example.com" },
      },
      {
        id: "scoring-retro-plus-analyst",
        goal: "Create an event titled 'Scoring retrospective' on July 14, 2026 at 16:00 for 60 minutes with attendees evals@example.com and analyst@example.com.",
        taskConfig: { expectedTitle: "Scoring retrospective", expectedDate: "2026-07-14", expectedStartTime: "16:00", expectedDurationMinutes: 60, expectedAttendeeEmail: "evals@example.com", expectedSecondaryAttendeeEmail: "analyst@example.com" },
      },
    ],
    // Hard pool: the start time is not given. The agent must read the existing
    // commitments shown on the calendar, respect the stated business-hours
    // window, and book the earliest conflict-free slot of the requested length.
    hard: [
      {
        id: "conflict-avoidance-single",
        goal: "Mira needs a 45-minute 'Sprint planning' on July 9, 2026 with attendee mira@example.com. Book it within business hours (09:00–17:00) at the earliest time that does not overlap any of mira@example.com's existing commitments shown on the calendar.",
        taskConfig: {
          expectedTitle: "Sprint planning",
          expectedDate: "2026-07-09",
          expectedStartTime: "12:00",
          expectedDurationMinutes: 45,
          expectedAttendeeEmail: "mira@example.com",
          schedulingWindowStart: "09:00",
          schedulingWindowEnd: "17:00",
          seedBusyEvents: [
            { id: "busy-mira-standup", title: "Team standup", date: "2026-07-09", startTime: "09:00", durationMinutes: 90, attendeeEmail: "mira@example.com" },
            { id: "busy-mira-review", title: "Design review", date: "2026-07-09", startTime: "11:00", durationMinutes: 60, attendeeEmail: "mira@example.com" },
            { id: "busy-mira-1on1", title: "1:1 with lead", date: "2026-07-09", startTime: "13:00", durationMinutes: 150, attendeeEmail: "mira@example.com" },
          ],
        },
      },
      {
        id: "shared-window-two-attendees",
        goal: "Schedule a 30-minute 'Launch sync' on July 13, 2026 with attendees mira@example.com and lead@example.com. Book it within business hours (09:00–17:00) at the earliest time that is free for BOTH attendees given the commitments shown on the calendar.",
        taskConfig: {
          expectedTitle: "Launch sync",
          expectedDate: "2026-07-13",
          expectedStartTime: "10:30",
          expectedDurationMinutes: 30,
          expectedAttendeeEmail: "mira@example.com",
          expectedSecondaryAttendeeEmail: "lead@example.com",
          schedulingWindowStart: "09:00",
          schedulingWindowEnd: "17:00",
          seedBusyEvents: [
            { id: "busy-mira-am", title: "Roadmap review", date: "2026-07-13", startTime: "09:00", durationMinutes: 60, attendeeEmail: "mira@example.com" },
            { id: "busy-mira-late", title: "Vendor call", date: "2026-07-13", startTime: "11:00", durationMinutes: 30, attendeeEmail: "mira@example.com" },
            { id: "busy-lead-am", title: "Hiring panel", date: "2026-07-13", startTime: "09:30", durationMinutes: 60, attendeeEmail: "lead@example.com" },
            { id: "busy-lead-noon", title: "Budget sync", date: "2026-07-13", startTime: "12:00", durationMinutes: 60, attendeeEmail: "lead@example.com" },
          ],
        },
      },
      {
        id: "timezone-overlap",
        goal: "Schedule a 30-minute 'Berlin handoff' on July 15, 2026 with attendees ny@example.com and berlin@example.com. All calendar times are US Eastern (ET). ny@example.com is available 09:00–17:00 ET. berlin@example.com is available 14:00–18:00 Central European Summer Time, which is ET+6. Book the event in ET at the earliest time inside the attendees' shared availability that does not overlap any commitment shown on the calendar.",
        taskConfig: {
          expectedTitle: "Berlin handoff",
          expectedDate: "2026-07-15",
          expectedStartTime: "10:00",
          expectedDurationMinutes: 30,
          expectedAttendeeEmail: "ny@example.com",
          expectedSecondaryAttendeeEmail: "berlin@example.com",
          schedulingWindowStart: "09:00",
          schedulingWindowEnd: "12:00",
          seedBusyEvents: [
            { id: "busy-ny-early", title: "Morning triage", date: "2026-07-15", startTime: "09:00", durationMinutes: 60, attendeeEmail: "ny@example.com" },
            { id: "busy-ny-mid", title: "Incident review", date: "2026-07-15", startTime: "10:30", durationMinutes: 90, attendeeEmail: "ny@example.com" },
          ],
        },
      },
      {
        id: "reschedule-longer-meeting",
        goal: "Book a 60-minute 'Quarterly planning' on July 16, 2026 with attendee evals@example.com. Book it within business hours (09:00–17:00) at the earliest time that does not overlap any of evals@example.com's existing commitments shown on the calendar.",
        taskConfig: {
          expectedTitle: "Quarterly planning",
          expectedDate: "2026-07-16",
          expectedStartTime: "12:00",
          expectedDurationMinutes: 60,
          expectedAttendeeEmail: "evals@example.com",
          schedulingWindowStart: "09:00",
          schedulingWindowEnd: "17:00",
          seedBusyEvents: [
            { id: "busy-evals-standup", title: "Standup", date: "2026-07-16", startTime: "09:00", durationMinutes: 60, attendeeEmail: "evals@example.com" },
            { id: "busy-evals-sync", title: "Metrics sync", date: "2026-07-16", startTime: "10:30", durationMinutes: 90, attendeeEmail: "evals@example.com" },
            { id: "busy-evals-lunch", title: "Lunch & learn", date: "2026-07-16", startTime: "13:00", durationMinutes: 60, attendeeEmail: "evals@example.com" },
            { id: "busy-evals-pm", title: "Customer review", date: "2026-07-16", startTime: "14:30", durationMinutes: 150, attendeeEmail: "evals@example.com" },
          ],
        },
      },
    ],
  },
});
