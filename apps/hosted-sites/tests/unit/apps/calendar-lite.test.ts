import assert from "node:assert/strict";
import test from "node:test";
import {
  createCalendarEvent,
  recheckCalendarAvailability,
  updateCalendarEvent,
} from "../../../src/apps/calendar-lite/actions.js";
import { evaluateCalendarLite } from "../../../src/apps/calendar-lite/evaluate.js";
import {
  computeEarliestFreeSlot,
  readBusyEvents,
  visibleBusyEvents,
} from "../../../src/apps/calendar-lite/scheduling.js";
import { buildInitialSessionState } from "../../../src/runtime/app-registry.js";
import type { HostedSessionFor } from "../../../src/runtime/types.js";

function makeSession(): HostedSessionFor<"calendar-lite"> {
  return {
    app: "calendar-lite",
    taskSlug: "calendar-event-create",
    metadata: {
      questionGeneration: {
        schemaVersion: 3,
        generationSeed: "calendar-test",
        variantId: "architecture-review",
        taskConfig: {
          expectedTitle: "Architecture review",
          expectedDate: "2026-07-08",
          expectedStartTime: "14:30",
          expectedDurationMinutes: 45,
          expectedAttendeeEmail: "mira@example.com",
        },
      },
    },
    state: buildInitialSessionState("calendar-lite"),
  } as unknown as HostedSessionFor<"calendar-lite">;
}

test("calendar action normalizes and persists a valid event", () => {
  const session = makeSession();
  const result = createCalendarEvent(session, {
    title: " Architecture review ",
    date: "2026-07-08",
    startTime: "14:30",
    durationMinutes: 45,
    attendeeEmail: " MIRA@EXAMPLE.COM ",
    makeId: () => "event-1",
    now: () => "2026-06-24T00:00:00.000Z",
  });

  assert.equal(result.success, true);
  assert.equal(session.state.calendarEvents[0]?.title, "Architecture review");
  assert.equal(session.state.calendarEvents[0]?.attendeeEmail, "mira@example.com");
  assert.equal(evaluateCalendarLite(session).status, "passed");
});

test("calendar action treats an empty optional secondary attendee as absent", () => {
  const session = makeSession();
  const result = createCalendarEvent(session, {
    title: "Architecture review",
    date: "2026-07-08",
    startTime: "14:30",
    durationMinutes: 45,
    attendeeEmail: "mira@example.com",
    secondaryAttendeeEmail: "   ",
    makeId: () => "event-1",
    now: () => "2026-06-24T00:00:00.000Z",
  });

  assert.equal(result.success, true);
  assert.equal(session.state.calendarEvents[0]?.secondaryAttendeeEmail, undefined);
});

test("calendar evaluator rejects the wrong schedule", () => {
  const session = makeSession();
  createCalendarEvent(session, {
    title: "Architecture review",
    date: "2026-07-08",
    startTime: "09:00",
    durationMinutes: 45,
    attendeeEmail: "mira@example.com",
    makeId: () => "event-1",
    now: () => "2026-06-24T00:00:00.000Z",
  });

  assert.equal(evaluateCalendarLite(session).status, "failed");
});

test("calendar action creates an event with two attendees and normalizes emails", () => {
  const session = makeSession();
  session.metadata = {
    questionGeneration: {
      schemaVersion: 3,
      generationSeed: "calendar-test",
      variantId: "architecture-review-plus-lead",
      taskConfig: {
        expectedTitle: "Architecture review",
        expectedDate: "2026-07-08",
        expectedStartTime: "14:30",
        expectedDurationMinutes: 45,
        expectedAttendeeEmail: "mira@example.com",
        expectedSecondaryAttendeeEmail: "lead@example.com",
      },
    },
  };
  const result = createCalendarEvent(session, {
    title: "Architecture review",
    date: "2026-07-08",
    startTime: "14:30",
    durationMinutes: 45,
    attendeeEmail: "MIRA@EXAMPLE.COM",
    secondaryAttendeeEmail: " LEAD@EXAMPLE.COM ",
    makeId: () => "event-1",
    now: () => "2026-06-24T00:00:00.000Z",
  });

  assert.equal(result.success, true);
  assert.equal(session.state.calendarEvents[0]?.attendeeEmail, "mira@example.com");
  assert.equal(session.state.calendarEvents[0]?.secondaryAttendeeEmail, "lead@example.com");
  assert.equal(evaluateCalendarLite(session).status, "passed");
});

test("calendar action rejects an invalid secondary attendee email", () => {
  const session = makeSession();
  assert.deepEqual(
    createCalendarEvent(session, {
      title: "Architecture review",
      date: "2026-07-08",
      startTime: "14:30",
      durationMinutes: 45,
      attendeeEmail: "mira@example.com",
      secondaryAttendeeEmail: "invalid",
      makeId: () => "event-1",
      now: () => "2026-06-24T00:00:00.000Z",
    }),
    { success: false, error: "Secondary attendee email is invalid" },
  );
});

test("calendar evaluator fails when secondary attendee is required but missing", () => {
  const session = makeSession();
  session.metadata = {
    questionGeneration: {
      schemaVersion: 3,
      generationSeed: "calendar-test",
      variantId: "architecture-review-plus-lead",
      taskConfig: {
        expectedTitle: "Architecture review",
        expectedDate: "2026-07-08",
        expectedStartTime: "14:30",
        expectedDurationMinutes: 45,
        expectedAttendeeEmail: "mira@example.com",
        expectedSecondaryAttendeeEmail: "lead@example.com",
      },
    },
  };
  createCalendarEvent(session, {
    title: "Architecture review",
    date: "2026-07-08",
    startTime: "14:30",
    durationMinutes: 45,
    attendeeEmail: "mira@example.com",
    makeId: () => "event-1",
    now: () => "2026-06-24T00:00:00.000Z",
  });

  assert.equal(evaluateCalendarLite(session).status, "failed");
});

test("calendar action rejects invalid duration and attendee", () => {
  const session = makeSession();
  assert.deepEqual(
    createCalendarEvent(session, {
      title: "Architecture review",
      date: "2026-07-08",
      startTime: "14:30",
      durationMinutes: 0,
      attendeeEmail: "mira@example.com",
      makeId: () => "event-1",
      now: () => "2026-06-24T00:00:00.000Z",
    }),
    { success: false, error: "Duration is invalid" },
  );
  assert.deepEqual(
    createCalendarEvent(session, {
      title: "Architecture review",
      date: "2026-07-08",
      startTime: "14:30",
      durationMinutes: 45,
      attendeeEmail: "invalid",
      makeId: () => "event-1",
      now: () => "2026-06-24T00:00:00.000Z",
    }),
    { success: false, error: "Attendee email is invalid" },
  );
});

// Hard availability variants (#113): the agent must book the earliest
// conflict-free slot around the existing commitments carried in task config.
type HardCalendarVariant = {
  id: string;
  taskConfig: Record<string, unknown>;
  // A slot that collides with a seeded commitment for a shared attendee.
  conflictingStartTime: string;
};

const hardCalendarVariants: HardCalendarVariant[] = [
  {
    id: "conflict-avoidance-single",
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
    conflictingStartTime: "11:30",
  },
  {
    id: "shared-window-two-attendees",
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
    conflictingStartTime: "12:15",
  },
  {
    id: "timezone-overlap",
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
    conflictingStartTime: "09:30",
  },
  {
    id: "reschedule-longer-meeting",
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
    conflictingStartTime: "13:30",
  },
];

function makeHardSession(taskConfig: Record<string, unknown>): HostedSessionFor<"calendar-lite"> {
  return {
    app: "calendar-lite",
    taskSlug: "calendar-event-create-hard",
    metadata: {
      questionGeneration: {
        schemaVersion: 3,
        generationSeed: "calendar-hard-test",
        variantId: "hard",
        taskConfig,
      },
    },
    state: buildInitialSessionState("calendar-lite"),
  } as unknown as HostedSessionFor<"calendar-lite">;
}

for (const variant of hardCalendarVariants) {
  test(`calendar hard variant ${variant.id}: passes at the earliest conflict-free slot`, () => {
    const session = makeHardSession(variant.taskConfig);
    const created = createCalendarEvent(session, {
      title: String(variant.taskConfig.expectedTitle),
      date: String(variant.taskConfig.expectedDate),
      startTime: String(variant.taskConfig.expectedStartTime),
      durationMinutes: Number(variant.taskConfig.expectedDurationMinutes),
      attendeeEmail: String(variant.taskConfig.expectedAttendeeEmail),
      secondaryAttendeeEmail:
        typeof variant.taskConfig.expectedSecondaryAttendeeEmail === "string"
          ? variant.taskConfig.expectedSecondaryAttendeeEmail
          : undefined,
      makeId: () => "event-hard",
      now: () => "2026-06-24T00:00:00.000Z",
    });
    assert.equal(created.success, true);
    const result = evaluateCalendarLite(session);
    assert.equal(result.status, "passed", result.summary);
    assert.equal(result.score, 1);
  });

  test(`calendar hard variant ${variant.id}: fails when the slot overlaps a commitment`, () => {
    const session = makeHardSession(variant.taskConfig);
    createCalendarEvent(session, {
      title: String(variant.taskConfig.expectedTitle),
      date: String(variant.taskConfig.expectedDate),
      startTime: variant.conflictingStartTime,
      durationMinutes: Number(variant.taskConfig.expectedDurationMinutes),
      attendeeEmail: String(variant.taskConfig.expectedAttendeeEmail),
      secondaryAttendeeEmail:
        typeof variant.taskConfig.expectedSecondaryAttendeeEmail === "string"
          ? variant.taskConfig.expectedSecondaryAttendeeEmail
          : undefined,
      makeId: () => "event-hard",
      now: () => "2026-06-24T00:00:00.000Z",
    });
    assert.equal(evaluateCalendarLite(session).status, "failed");
  });

  test(`calendar hard variant ${variant.id}: canonical answer is the true earliest free slot`, () => {
    const config = variant.taskConfig;
    const attendees = [config.expectedAttendeeEmail, config.expectedSecondaryAttendeeEmail].filter(
      (email): email is string => typeof email === "string",
    );
    const earliest = computeEarliestFreeSlot({
      date: String(config.expectedDate),
      durationMinutes: Number(config.expectedDurationMinutes),
      windowStart: String(config.schedulingWindowStart),
      windowEnd: String(config.schedulingWindowEnd),
      attendees,
      busyEvents: readBusyEvents(config),
    });
    // The configured answer must match the independently-computed earliest
    // conflict-free slot.
    assert.equal(earliest, config.expectedStartTime);
  });
}

test("calendar campaign requires a deterministic actor recheck before accepting the revised schedule", () => {
  const taskConfig = {
    expectedTitle: "Carried note title",
    expectedDate: "2026-07-22",
    expectedStartTime: "11:00",
    expectedDurationMinutes: 30,
    expectedAttendeeEmail: "mira@example.com",
    schedulingWindowStart: "09:00",
    schedulingWindowEnd: "13:00",
    seedBusyEvents: [
      { id: "busy-initial", title: "Planning", date: "2026-07-22", startTime: "09:00", durationMinutes: 60, attendeeEmail: "mira@example.com" },
    ],
    actorUpdate: {
      requiredRechecks: 2,
      pendingMessage: "Still pending",
      appliedMessage: "Customer call added",
      provisionalStartTime: "10:00",
      busyEvent: { id: "busy-actor", title: "Customer call", date: "2026-07-22", startTime: "10:00", durationMinutes: 60, attendeeEmail: "mira@example.com" },
    },
  };
  const session = makeHardSession(taskConfig);
  createCalendarEvent(session, {
    title: taskConfig.expectedTitle,
    date: taskConfig.expectedDate,
    startTime: taskConfig.actorUpdate.provisionalStartTime,
    durationMinutes: taskConfig.expectedDurationMinutes,
    attendeeEmail: taskConfig.expectedAttendeeEmail,
    makeId: () => "event-campaign",
    now: () => "2026-06-24T00:00:00.000Z",
  });
  assert.equal(session.state.calendarEvents[0]?.revisionCount, 0);
  assert.equal(evaluateCalendarLite(session).status, "failed");

  const first = recheckCalendarAvailability(session, taskConfig, {
    makeId: () => "check-1",
    now: () => "2026-06-24T00:00:01.000Z",
  });
  assert.equal(first.success && first.check.status, "pending");
  assert.equal(visibleBusyEvents(taskConfig, 1).length, 1);
  assert.equal(evaluateCalendarLite(session).status, "failed");

  const second = recheckCalendarAvailability(session, taskConfig, {
    makeId: () => "check-2",
    now: () => "2026-06-24T00:00:02.000Z",
  });
  assert.equal(second.success && second.check.status, "updated");
  assert.equal(visibleBusyEvents(taskConfig, 2).length, 2);
  assert.equal(evaluateCalendarLite(session).status, "failed");
  const revised = updateCalendarEvent(session, {
    eventId: "event-campaign",
    title: taskConfig.expectedTitle,
    date: taskConfig.expectedDate,
    startTime: taskConfig.expectedStartTime,
    durationMinutes: taskConfig.expectedDurationMinutes,
    attendeeEmail: taskConfig.expectedAttendeeEmail,
    now: () => "2026-06-24T00:00:03.000Z",
  });
  assert.equal(revised.success, true);
  assert.equal(revised.success && revised.calendarEvent.id, "event-campaign");
  assert.equal(revised.success && revised.calendarEvent.revisionCount, 1);
  assert.equal(evaluateCalendarLite(session).status, "passed");
  assert.equal(
    computeEarliestFreeSlot({
      date: taskConfig.expectedDate,
      durationMinutes: taskConfig.expectedDurationMinutes,
      windowStart: taskConfig.schedulingWindowStart,
      windowEnd: taskConfig.schedulingWindowEnd,
      attendees: [taskConfig.expectedAttendeeEmail],
      busyEvents: visibleBusyEvents(taskConfig, 2),
    }),
    taskConfig.expectedStartTime,
  );
});

test("calendar campaign rejects a replacement event after the actor update", () => {
  const taskConfig = {
    expectedTitle: "Carried note title",
    expectedDate: "2026-07-22",
    expectedStartTime: "11:00",
    expectedDurationMinutes: 30,
    expectedAttendeeEmail: "mira@example.com",
    actorUpdate: {
      requiredRechecks: 2,
      pendingMessage: "Still pending",
      appliedMessage: "Customer call added",
      provisionalStartTime: "10:00",
      busyEvent: { id: "busy-actor", title: "Customer call", date: "2026-07-22", startTime: "10:00", durationMinutes: 60, attendeeEmail: "mira@example.com" },
    },
  };
  const session = makeHardSession(taskConfig);
  createCalendarEvent(session, {
    title: taskConfig.expectedTitle,
    date: taskConfig.expectedDate,
    startTime: taskConfig.actorUpdate.provisionalStartTime,
    durationMinutes: taskConfig.expectedDurationMinutes,
    attendeeEmail: taskConfig.expectedAttendeeEmail,
    makeId: () => "event-tentative",
    now: () => "2026-06-24T00:00:00.000Z",
  });
  recheckCalendarAvailability(session, taskConfig, { makeId: () => "check-1", now: () => "2026-06-24T00:00:01.000Z" });
  recheckCalendarAvailability(session, taskConfig, { makeId: () => "check-2", now: () => "2026-06-24T00:00:02.000Z" });
  createCalendarEvent(session, {
    title: taskConfig.expectedTitle,
    date: taskConfig.expectedDate,
    startTime: taskConfig.expectedStartTime,
    durationMinutes: taskConfig.expectedDurationMinutes,
    attendeeEmail: taskConfig.expectedAttendeeEmail,
    makeId: () => "event-replacement",
    now: () => "2026-06-24T00:00:03.000Z",
  });
  assert.equal(evaluateCalendarLite(session).status, "failed");
});
