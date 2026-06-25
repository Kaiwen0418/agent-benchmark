import type { HostedSessionFor } from "../../runtime/types.js";

export function buildNotesFinalState(session: HostedSessionFor<"notes-lite">) {
  return {
    app: "notes-lite",
    taskSlug: session.taskSlug,
    notes: session.state.notes.map((note) => ({
      id: note.id,
      title: note.title,
      tag: note.tag,
      bodyLength: note.body.length,
    })),
  };
}
