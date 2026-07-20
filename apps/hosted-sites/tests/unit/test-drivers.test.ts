import assert from "node:assert/strict";
import test from "node:test";

type Driver = {
  complete(params: Record<string, unknown>): Promise<void>;
};

function requireString(value: unknown, label: string) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok((value as string).length > 0, `${label} must not be empty`);
  return value as string;
}

function requireObject(value: unknown, label: string) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

test("hard smoke drivers carry Wiki answers through Notes into Calendar", async () => {
  const wiki = (await import("../../src/apps/wiki-lite/test-driver.mjs")) as Driver;
  const notes = (await import("../../src/apps/notes-lite/test-driver.mjs")) as Driver;
  const calendar = (await import("../../src/apps/calendar-lite/test-driver.mjs")) as Driver;
  const context: Record<string, string> = {};
  const formPosts: Array<{ path: string; values: Record<string, string> }> = [];
  const common = {
    context,
    hostedBaseUrl: "https://hosted.example.test",
    checkedFetch: async () => undefined,
    postForm: async (path: string, _token: string, values: Record<string, string>) => {
      formPosts.push({ path, values });
    },
    requireString,
    requireObject,
  };

  await wiki.complete({
    ...common,
    session: { token: "wiki-release", taskSlug: "wiki-release-answer-hard" },
    config: {
      targetArticleSlug: "returns-policy",
      answerContract: { canonicalValue: "30 days" },
    },
  });
  await wiki.complete({
    ...common,
    session: { token: "wiki-policy", taskSlug: "wiki-policy-answer-hard" },
    config: {
      targetArticleSlug: "retention-policy",
      answerContract: { canonicalValue: "90 days" },
    },
  });
  await notes.complete({
    ...common,
    session: { token: "notes", taskSlug: "notes-followup-create-hard" },
    config: {
      expectedTag: "handoff",
      expectedNotes: [
        { title: "Implementation", body: "Track it.", tag: "implementation" },
        { title: "Verification", body: "Verify it.", tag: "verification" },
      ],
    },
  });
  await calendar.complete({
    ...common,
    session: { token: "calendar", taskSlug: "calendar-event-create-hard" },
    config: {
      expectedDate: "2026-07-20",
      expectedStartTime: "15:00",
      expectedDurationMinutes: 30,
      expectedAttendeeEmail: "mira@example.com",
    },
  });

  assert.deepEqual(context, {
    wikiReleaseAnswer: "30 days",
    wikiPolicyAnswer: "90 days",
    noteTitle: "30 days",
  });
  assert.deepEqual(formPosts.at(-2), {
    path: "/notes/create",
    values: { title: "30 days", body: "90 days", tag: "handoff" },
  });
  assert.deepEqual(formPosts.at(-1), {
    path: "/calendar/events",
    values: {
      title: "30 days",
      date: "2026-07-20",
      startTime: "15:00",
      durationMinutes: "30",
      attendeeEmail: "mira@example.com",
    },
  });
});

test("capability surface smoke drivers complete inbox and sheets workflows", async () => {
  const inbox = (await import("../../src/apps/inbox-lite/test-driver.mjs")) as Driver;
  const sheets = (await import("../../src/apps/sheets-lite/test-driver.mjs")) as Driver;
  const formPosts: Array<{ path: string; values: Record<string, string> }> = [];
  const common = {
    postForm: async (path: string, _token: string, values: Record<string, string>) => {
      formPosts.push({ path, values });
    },
    requireString,
  };

  await inbox.complete({
    ...common,
    session: { token: "inbox" },
    config: {
      targetThreadId: "thread-northwind-contract",
      expectedRecipients: ["legal-approvals@acme.test"],
      expectedSubject: "Approval: Northwind contract exception",
      expectedBody: "Safe summary",
    },
  });
  await sheets.complete({
    ...common,
    session: { token: "sheets" },
    config: {
      expectedRows: [{
        orderId: "PO-101",
        vendorName: "Northstar Components",
        subtotal: 600,
        tax: 120,
        landedTotal: 745,
        decision: "APPROVE",
      }],
    },
  });

  assert.equal(formPosts[0]?.path, "/inbox/send");
  assert.equal(formPosts[1]?.path, "/sheets/rows");
  assert.equal(formPosts[2]?.path, "/sheets/validate");
});
