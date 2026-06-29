import { configString, configStringOrNull, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const notesLiteTestSupport: HostedAppTestSupport<"notes-lite"> = {
  exampleTaskConfig: {
    expectedTitle: "Support follow-up",
    expectedBody: "Email Mira after the replacement adapter ships.",
    expectedTag: "support",
  },
  applyPassingState: (session, config) => {
    const targetNoteId = configStringOrNull(config, "targetNoteId");
    if (targetNoteId) {
      const note = session.state.notes.find((candidate) => candidate.id === targetNoteId);
      if (!note) {
        throw new Error(`missing seeded note ${targetNoteId}`);
      }
      note.title = configString(config, "expectedTitle");
      note.body = configString(config, "expectedBody");
      note.tag = configString(config, "expectedTag");
      session.metadata = { ...session.metadata, _testTargetNoteId: targetNoteId };
      return;
    }
    session.state.notes.push({
      id: "note-smoke-pass",
      // Carry variants leave the title unpinned; a non-empty placeholder
      // satisfies the lenient per-session title check.
      title: configStringOrNull(config, "expectedTitle") ?? "carried-value",
      body: configString(config, "expectedBody"),
      tag: configString(config, "expectedTag"),
      createdAt: "2026-06-23T00:00:00.000Z",
    });
  },
  breakPassingState: (session) => {
    const targetNoteId =
      typeof session.metadata._testTargetNoteId === "string" ? session.metadata._testTargetNoteId : null;
    const note = targetNoteId
      ? session.state.notes.find((candidate) => candidate.id === targetNoteId)
      : session.state.notes.at(-1);
    if (note) {
      note.tag = "incorrect";
    }
  },
};
