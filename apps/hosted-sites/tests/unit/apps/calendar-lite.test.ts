import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarEvent } from "../../../src/apps/calendar-lite/actions.js";
import { evaluateCalendarLite } from "../../../src/apps/calendar-lite/evaluate.js";
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
