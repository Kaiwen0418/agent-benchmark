import { configString, type HostedAppTestSupport } from "../../runtime/test-support.js";

export const notesLiteTestSupport: HostedAppTestSupport<"notes-lite"> = {
  applyPassingState: (session, config) => {
    session.state.notes.push({
      id: "note-smoke-pass",
      title: configString(config, "expectedTitle"),
      body: configString(config, "expectedBody"),
      tag: configString(config, "expectedTag"),
      createdAt: "2026-06-23T00:00:00.000Z",
    });
  },
  breakPassingState: (session) => {
    const note = session.state.notes.at(-1);
    if (note) {
      note.tag = "incorrect";
    }
  },
};
