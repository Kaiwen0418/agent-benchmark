import { configString, configStringOrNull, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const notesLiteTestSupport: HostedAppTestSupport<"notes-lite"> = {
  exampleTaskConfig: {
    expectedTitle: "Support follow-up",
    expectedBody: "Email Mira after the replacement adapter ships.",
    expectedTag: "support",
  },
  applyPassingState: (session, config) => {
    if (Array.isArray(config.expectedNotes)) {
      config.expectedNotes.forEach((expected, index) => {
        if (typeof expected !== "object" || expected === null) return;
        const note = expected as Record<string, unknown>;
        session.state.notes.push({
          id: `note-set-${index}`,
          title: configString(note, "title"),
          body: configString(note, "body"),
          tag: configString(note, "tag"),
          createdAt: "2026-06-23T00:00:00.000Z",
        });
      });
      session.state.notes.push({
        id: "note-set-carry",
        title: "carried-value",
        body: "second-carried-value",
        tag: configString(config, "expectedTag"),
        createdAt: "2026-06-23T00:00:00.000Z",
      });
      return;
    }
    const targetNoteId = configStringOrNull(config, "targetNoteId");
    if (targetNoteId) {
      const note = session.state.notes.find((candidate) => candidate.id === targetNoteId);
      if (!note) {
        throw new Error(`missing seeded note ${targetNoteId}`);
      }
      note.title = configStringOrNull(config, "expectedTitle") ?? "carried-value";
      note.body = configStringOrNull(config, "expectedBody") ?? "second-carried-value";
      note.tag = configString(config, "expectedTag");
      session.metadata = { ...session.metadata, _testTargetNoteId: targetNoteId };
      return;
    }
    session.state.notes.push({
      id: "note-smoke-pass",
      // Carry variants leave the title unpinned; a non-empty placeholder
      // satisfies the lenient per-session title check.
      title: configStringOrNull(config, "expectedTitle") ?? "carried-value",
      body: configStringOrNull(config, "expectedBody") ?? "second-carried-value",
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
