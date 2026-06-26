import type { HostedSessionFor } from "../../runtime/types.js";
import type { Note } from "./types.js";

type NotesSession = HostedSessionFor<"notes-lite">;

export function createNote(
  session: NotesSession,
  params: {
    title: string;
    body: string;
    tag: string;
    now: () => string;
    makeId: (prefix: string) => string;
  },
) {
  const title = params.title.trim();
  const body = params.body.trim();
  const tag = params.tag.trim();

  if (!title) return { success: false, error: "Title is required" } as const;
  if (!body) return { success: false, error: "Body is required" } as const;
  if (!tag) return { success: false, error: "Tag is required" } as const;

  const note: Note = {
    id: params.makeId("note"),
    title,
    body,
    tag,
    createdAt: params.now(),
  };
  session.state.notes.push(note);
  return { success: true, note } as const;
}

export function updateNote(
  session: NotesSession,
  params: {
    noteId: string;
    title: string;
    body: string;
    tag: string;
  },
) {
  const note = session.state.notes.find((candidate) => candidate.id === params.noteId);
  if (!note) {
    return { success: false, error: "Note not found" } as const;
  }

  const title = params.title.trim();
  const body = params.body.trim();
  const tag = params.tag.trim();

  if (!title) return { success: false, error: "Title is required" } as const;
  if (!body) return { success: false, error: "Body is required" } as const;
  if (!tag) return { success: false, error: "Tag is required" } as const;

  note.title = title;
  note.body = body;
  note.tag = tag;
  return { success: true, note } as const;
}
